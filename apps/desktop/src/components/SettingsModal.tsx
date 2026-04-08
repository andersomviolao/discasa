import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { GuildSummary } from "@discasa/shared";
import type { MouseWheelBehavior, SettingsSection } from "../ui-types";
import { logoutDiscord } from "../lib/api";
import { BaseModal } from "./BaseModal";
import { ProfileAvatar } from "./ProfileAvatar";

type SettingsModalProps = {
  profile: {
    nickname: string;
    server: string;
    avatarUrl: string | null;
  };
  settingsSection: SettingsSection;
  sessionName: string | null;
  guilds: GuildSummary[];
  selectedGuildId: string;
  activeGuildName: string | null;
  isLoadingGuilds: boolean;
  isApplyingGuild: boolean;
  discordSettingsError: string;
  minimizeToTray: boolean;
  closeToTray: boolean;
  accentColor: string;
  accentInput: string;
  accentInputError: string;
  onClose: () => void;
  onSelectSection: (section: SettingsSection) => void;
  onOpenDiscordLogin: () => void;
  onOpenDiscordBotInstall: () => void;
  onSelectGuild: (guildId: string) => void;
  onApplyGuild: () => void;
  onChangeMinimizeToTray: (checked: boolean) => void;
  onChangeCloseToTray: (checked: boolean) => void;
  onAccentInputChange: (value: string) => void;
  onAccentInputBlur: () => void;
};

type HsvColor = {
  hue: number;
  saturation: number;
  value: number;
};

const settingsSections: Array<{ id: SettingsSection; label: string }> = [
  { id: "discord", label: "Discord" },
  { id: "appearance", label: "Appearance" },
  { id: "window", label: "Window" },
];

const VIEWER_MOUSE_WHEEL_BEHAVIOR_KEY = "discasa.viewer.mouseWheelBehavior";
const VIEWER_WHEEL_BEHAVIOR_EVENT = "discasa:viewer-wheel-behavior";

function readStoredMouseWheelBehavior(): MouseWheelBehavior {
  if (typeof window === "undefined") {
    return "zoom";
  }

  const raw = window.localStorage.getItem(VIEWER_MOUSE_WHEEL_BEHAVIOR_KEY);
  return raw === "navigate" ? "navigate" : "zoom";
}

function commitMouseWheelBehavior(nextValue: MouseWheelBehavior): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(VIEWER_MOUSE_WHEEL_BEHAVIOR_KEY, nextValue);
  window.dispatchEvent(new CustomEvent<MouseWheelBehavior>(VIEWER_WHEEL_BEHAVIOR_EVENT, { detail: nextValue }));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHexColor(value: string): string | null {
  const raw = value.trim().replace(/^#/, "");

  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const expanded = raw
      .split("")
      .map((character) => `${character}${character}`)
      .join("");

    return `#${expanded.toUpperCase()}`;
  }

  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }

  return null;
}

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const normalized = normalizeHexColor(hex) ?? "#E9881D";
  const value = normalized.slice(1);

  return {
    red: Number.parseInt(value.slice(0, 2), 16),
    green: Number.parseInt(value.slice(2, 4), 16),
    blue: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => clampNumber(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function rgbToHsv(red: number, green: number, blue: number): HsvColor {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;

  const max = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const min = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = max - min;

  let hue = 0;

  if (delta !== 0) {
    if (max === normalizedRed) {
      hue = ((normalizedGreen - normalizedBlue) / delta) % 6;
    } else if (max === normalizedGreen) {
      hue = (normalizedBlue - normalizedRed) / delta + 2;
    } else {
      hue = (normalizedRed - normalizedGreen) / delta + 4;
    }
  }

  hue = Math.round(hue * 60);
  if (hue < 0) {
    hue += 360;
  }

  const saturation = max === 0 ? 0 : delta / max;
  const value = max;

  return {
    hue,
    saturation,
    value,
  };
}

function hsvToRgb(hue: number, saturation: number, value: number): { red: number; green: number; blue: number } {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const chroma = value * saturation;
  const huePrime = normalizedHue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));

  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma;
    green = x;
  } else if (huePrime >= 1 && huePrime < 2) {
    red = x;
    green = chroma;
  } else if (huePrime >= 2 && huePrime < 3) {
    green = chroma;
    blue = x;
  } else if (huePrime >= 3 && huePrime < 4) {
    green = x;
    blue = chroma;
  } else if (huePrime >= 4 && huePrime < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const match = value - chroma;

  return {
    red: Math.round((red + match) * 255),
    green: Math.round((green + match) * 255),
    blue: Math.round((blue + match) * 255),
  };
}

function hexToHsv(hex: string): HsvColor {
  const { red, green, blue } = hexToRgb(hex);
  return rgbToHsv(red, green, blue);
}

function hsvToHex(hue: number, saturation: number, value: number): string {
  const { red, green, blue } = hsvToRgb(hue, saturation, value);
  return rgbToHex(red, green, blue);
}

type AccentColorPickerProps = {
  color: string;
  accentInputError: string;
  onCommitHex: (nextHex: string) => void;
};

function AccentColorPicker({ color, accentInputError, onCommitHex }: AccentColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftHex, setDraftHex] = useState(color);
  const [draftHsv, setDraftHsv] = useState<HsvColor>(() => hexToHsv(color));
  const [draftError, setDraftError] = useState("");
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const saturationPanelRef = useRef<HTMLDivElement | null>(null);
  const hueTrackRef = useRef<HTMLDivElement | null>(null);
  const draftHexRef = useRef(draftHex);

  useEffect(() => {
    const normalized = normalizeHexColor(color) ?? color;
    setDraftHex(normalized);
    setDraftHsv(hexToHsv(normalized));
  }, [color]);

  useEffect(() => {
    draftHexRef.current = draftHex;
  }, [draftHex]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (anchorRef.current?.contains(event.target as Node)) {
        return;
      }

      resetDraft();
      setIsOpen(false);
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      resetDraft();
      setIsOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, color]);

  const hueOnlyColor = useMemo(() => hsvToHex(draftHsv.hue, 1, 1), [draftHsv.hue]);
  const displayHex = isOpen ? draftHex : color;
  const helperText = draftError || accentInputError || "Click the swatch to open the picker.";

  function resetDraft(): void {
    const normalized = normalizeHexColor(color) ?? color;
    const nextHsv = hexToHsv(normalized);
    draftHexRef.current = normalized;
    setDraftHex(normalized);
    setDraftHsv(nextHsv);
    setDraftError("");
  }

  function commitHex(nextHex: string): boolean {
    const normalized = normalizeHexColor(nextHex);

    if (!normalized) {
      setDraftError("Enter a valid HEX color.");
      return false;
    }

    const nextHsv = hexToHsv(normalized);
    draftHexRef.current = normalized;
    setDraftHex(normalized);
    setDraftHsv(nextHsv);
    setDraftError("");
    onCommitHex(normalized);
    return true;
  }

  function updateDraftFromHsv(nextHue: number, nextSaturation: number, nextValue: number): void {
    const normalizedHue = clampNumber(nextHue, 0, 360);
    const normalizedSaturation = clampNumber(nextSaturation, 0, 1);
    const normalizedValue = clampNumber(nextValue, 0, 1);
    const nextHex = hsvToHex(normalizedHue, normalizedSaturation, normalizedValue);
    const nextHsv = {
      hue: normalizedHue,
      saturation: normalizedSaturation,
      value: normalizedValue,
    };

    draftHexRef.current = nextHex;
    setDraftHsv(nextHsv);
    setDraftHex(nextHex);
    setDraftError("");
  }

  function updateSaturationFromClientPoint(clientX: number, clientY: number): void {
    const panel = saturationPanelRef.current;
    if (!panel) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    const nextSaturation = clampNumber((clientX - rect.left) / rect.width, 0, 1);
    const nextValue = clampNumber(1 - (clientY - rect.top) / rect.height, 0, 1);
    updateDraftFromHsv(draftHsv.hue, nextSaturation, nextValue);
  }

  function updateHueFromClientPoint(clientX: number): void {
    const track = hueTrackRef.current;
    if (!track) {
      return;
    }

    const rect = track.getBoundingClientRect();
    const ratio = clampNumber((clientX - rect.left) / rect.width, 0, 1);
    updateDraftFromHsv(ratio * 360, draftHsv.saturation, draftHsv.value);
  }

  function handleSaturationPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    updateSaturationFromClientPoint(event.clientX, event.clientY);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateSaturationFromClientPoint(moveEvent.clientX, moveEvent.clientY);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      void commitHex(draftHexRef.current);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function handleHuePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    updateHueFromClientPoint(event.clientX);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateHueFromClientPoint(moveEvent.clientX);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      void commitHex(draftHexRef.current);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function handleHexInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextValue = event.currentTarget.value.toUpperCase();
    setDraftHex(nextValue);

    const normalized = normalizeHexColor(nextValue);
    if (!normalized) {
      setDraftError("Enter a valid HEX color.");
      return;
    }

    setDraftError("");
    setDraftHsv(hexToHsv(normalized));
  }

  function handleHexInputBlur(): void {
    if (!commitHex(draftHex)) {
      return;
    }

    setIsOpen(false);
  }

  function handleHexInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      if (commitHex(draftHex)) {
        setIsOpen(false);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      resetDraft();
      setIsOpen(false);
    }
  }

  function handleTogglePicker(): void {
    if (isOpen) {
      resetDraft();
      setIsOpen(false);
      return;
    }

    resetDraft();
    setIsOpen(true);
  }

  return (
    <div className="settings-field-stack">
      <label className="settings-input-label" htmlFor="accent-hex-display">
        Accent color (HEX)
      </label>

      <div className="settings-color-row">
        <div ref={anchorRef} className="settings-color-picker-anchor">
          <button
            type="button"
            className="settings-color-preview-button"
            aria-label="Open accent color picker"
            aria-expanded={isOpen}
            onClick={handleTogglePicker}
          >
            <span
              className="settings-color-preview settings-color-preview-large"
              aria-hidden="true"
              style={{ backgroundColor: displayHex }}
            />
          </button>

          {isOpen ? (
            <div className="settings-color-picker-popover" role="dialog" aria-label="Accent color picker">
              <div
                ref={saturationPanelRef}
                className="settings-color-picker-surface"
                style={{
                  backgroundColor: hueOnlyColor,
                  backgroundImage: `
                    linear-gradient(180deg, transparent 0%, #000000 100%),
                    linear-gradient(90deg, #FFFFFF 0%, transparent 100%)
                  `,
                }}
                onPointerDown={handleSaturationPointerDown}
              >
                <span
                  className="settings-color-picker-handle"
                  aria-hidden="true"
                  style={{
                    left: `calc(${draftHsv.saturation * 100}% - 8px)`,
                    top: `calc(${(1 - draftHsv.value) * 100}% - 8px)`,
                  }}
                />
              </div>

              <div ref={hueTrackRef} className="settings-color-picker-hue" onPointerDown={handleHuePointerDown}>
                <span
                  className="settings-color-picker-handle settings-color-picker-handle-horizontal"
                  aria-hidden="true"
                  style={{
                    left: `calc(${(draftHsv.hue / 360) * 100}% - 8px)`,
                  }}
                />
              </div>

              <div className="settings-color-picker-hex-block">
                <span
                  className="settings-color-preview settings-color-picker-current"
                  aria-hidden="true"
                  style={{ backgroundColor: draftHex }}
                />
                <label className="settings-color-picker-hex-field">
                  <span className="settings-color-picker-hex-label">Hex</span>
                  <input
                    className={`form-text-input settings-color-picker-hex-input ${draftError ? "invalid" : ""}`}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={7}
                    value={draftHex}
                    onChange={handleHexInputChange}
                    onBlur={handleHexInputBlur}
                    onKeyDown={handleHexInputKeyDown}
                  />
                </label>
              </div>
            </div>
          ) : null}
        </div>

        <input
          id="accent-hex-display"
          className="form-text-input settings-color-display-input"
          type="text"
          value={color}
          readOnly
          aria-readonly="true"
        />
      </div>

      <span className={`settings-input-help ${draftError || accentInputError ? "error" : ""}`}>{helperText}</span>
    </div>
  );
}

export function SettingsModal(props: SettingsModalProps) {
  const {
    profile,
    settingsSection,
    sessionName,
    activeGuildName,
    minimizeToTray,
    closeToTray,
    accentColor,
    accentInputError,
    onClose,
    onSelectSection,
    onChangeMinimizeToTray,
    onChangeCloseToTray,
    onAccentInputChange,
  } = props;

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [mouseWheelBehavior, setMouseWheelBehavior] = useState<MouseWheelBehavior>(() => readStoredMouseWheelBehavior());

  async function handleLogout(): Promise<void> {
    setIsLoggingOut(true);
    setLogoutError("");

    try {
      await logoutDiscord();
      window.location.reload();
    } catch (caughtError) {
      setLogoutError(caughtError instanceof Error ? caughtError.message : "Could not logout from Discord.");
      setIsLoggingOut(false);
    }
  }

  function handleChangeMouseWheelBehavior(nextValue: MouseWheelBehavior): void {
    setMouseWheelBehavior(nextValue);
    commitMouseWheelBehavior(nextValue);
  }

  function renderDiscordContent() {
    const isConnected = Boolean(sessionName);

    return (
      <>
        <div className="settings-modal-header">
          <div>
            <h2>Discord</h2>
            <p>Discord authentication is handled automatically outside Discasa whenever the app needs a valid login.</p>
          </div>
        </div>

        <div className="settings-card panel-surface-secondary">
          <div className={`settings-status ${isConnected ? "connected" : "disconnected"}`}>
            {isConnected ? `Connected as ${sessionName}` : "Not connected"}
          </div>

          <span className="settings-input-help">
            {activeGuildName
              ? `Current applied server: ${activeGuildName}`
              : "No server is currently applied."}
          </span>

          {isConnected ? (
            <>
              <button
                type="button"
                className="pill-button danger-button primary-button"
                onClick={() => {
                  void handleLogout();
                }}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "Logging out..." : "Logout from Discord"}
              </button>

              <span className={`settings-input-help ${logoutError ? "error" : ""}`}>
                {logoutError || "After logout, Discasa will request a new browser login when access is needed again."}
              </span>
            </>
          ) : (
            <span className="settings-input-help">
              Discasa will start the browser login flow automatically when a Discord session is required.
            </span>
          )}
        </div>
      </>
    );
  }

  function renderContent() {
    if (settingsSection === "discord") {
      return renderDiscordContent();
    }

    if (settingsSection === "appearance") {
      return (
        <>
          <div className="settings-modal-header">
            <div>
              <h2>Appearance</h2>
              <p>Choose the accent color used by the colored elements across the interface.</p>
            </div>
          </div>

          <div className="settings-card panel-surface-secondary">
            <AccentColorPicker
              color={accentColor}
              accentInputError={accentInputError}
              onCommitHex={onAccentInputChange}
            />
          </div>
        </>
      );
    }

    return (
      <>
        <div className="settings-modal-header">
          <div>
            <h2>Window</h2>
            <p>Choose how Discasa behaves when minimizing or closing.</p>
          </div>
        </div>

        <div className="settings-card panel-surface-secondary">
          <label className="settings-toggle" htmlFor="minimize-to-tray">
            <div className="settings-toggle-copy">
              <span className="settings-toggle-title">Minimize to tray</span>
              <span className="settings-toggle-description">When minimizing, hide the app in the system tray.</span>
            </div>
            <input
              id="minimize-to-tray"
              className="settings-switch-input"
              type="checkbox"
              checked={minimizeToTray}
              onChange={(event) => onChangeMinimizeToTray(event.currentTarget.checked)}
            />
            <span className="settings-switch" aria-hidden="true" />
          </label>

          <label className="settings-toggle" htmlFor="close-to-tray">
            <div className="settings-toggle-copy">
              <span className="settings-toggle-title">Close to tray</span>
              <span className="settings-toggle-description">When closing, keep the app running in the system tray.</span>
            </div>
            <input
              id="close-to-tray"
              className="settings-switch-input"
              type="checkbox"
              checked={closeToTray}
              onChange={(event) => onChangeCloseToTray(event.currentTarget.checked)}
            />
            <span className="settings-switch" aria-hidden="true" />
          </label>

          <div className="settings-field-stack">
            <label className="settings-input-label" htmlFor="viewer-wheel-behavior">
              Mouse wheel in viewer
            </label>
            <select
              id="viewer-wheel-behavior"
              className="form-text-input settings-select-input"
              value={mouseWheelBehavior}
              onChange={(event) => handleChangeMouseWheelBehavior(event.currentTarget.value as MouseWheelBehavior)}
            >
              <option value="zoom">Zoom image</option>
              <option value="navigate">Go to previous / next item</option>
            </select>
            <span className="settings-input-help">
              Choose whether the mouse wheel zooms images or navigates between items in the internal viewer.
            </span>
          </div>
        </div>
      </>
    );
  }

  return (
    <BaseModal
      rootClassName="settings-modal-root"
      backdropClassName="settings-modal-backdrop"
      panelClassName="settings-modal"
      ariaLabel="Discasa settings"
      showCloseButton
      closeButtonClassName="settings-modal-close"
      closeButtonAriaLabel="Close settings"
      onClose={onClose}
    >
      <aside className="settings-modal-sidebar">
        <div className="settings-modal-profile">
          <ProfileAvatar avatarUrl={profile.avatarUrl} className="settings-modal-avatar" />
          <div className="settings-modal-profile-copy">
            <span className="settings-profile-primary">{profile.nickname}</span>
            <span className="settings-profile-secondary">{profile.server}</span>
          </div>
        </div>

        <div className="settings-modal-nav-group">
          <span className="settings-modal-nav-label">Settings</span>
          {settingsSections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`settings-modal-nav-item ${settingsSection === section.id ? "active" : ""}`}
              onClick={() => onSelectSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>
      </aside>

      <section className="settings-modal-content scrollable-y subtle-scrollbar content-scrollbar-host">
        {renderContent()}
      </section>
    </BaseModal>
  );
}

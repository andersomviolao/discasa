import type { ChangeEvent } from "react";
import { ProfileAvatar } from "./ProfileAvatar";
import type { SettingsSection } from "../ui-types";

type SettingsModalProps = {
  profile: {
    nickname: string;
    server: string;
    avatarUrl: string | null;
  };
  settingsSection: SettingsSection;
  sessionName: string | null;
  minimizeToTray: boolean;
  closeToTray: boolean;
  accentColor: string;
  accentInput: string;
  accentInputError: string;
  onClose: () => void;
  onSelectSection: (section: SettingsSection) => void;
  onOpenDiscordLogin: () => void;
  onChangeMinimizeToTray: (checked: boolean) => void;
  onChangeCloseToTray: (checked: boolean) => void;
  onAccentInputChange: (value: string) => void;
  onAccentInputBlur: () => void;
};

const settingsSections: Array<{ id: SettingsSection; label: string }> = [
  { id: "discord", label: "Discord" },
  { id: "appearance", label: "Appearance" },
  { id: "window", label: "Window" },
];

export function SettingsModal({
  profile,
  settingsSection,
  sessionName,
  minimizeToTray,
  closeToTray,
  accentColor,
  accentInput,
  accentInputError,
  onClose,
  onSelectSection,
  onOpenDiscordLogin,
  onChangeMinimizeToTray,
  onChangeCloseToTray,
  onAccentInputChange,
  onAccentInputBlur,
}: SettingsModalProps) {
  function renderContent() {
    if (settingsSection === "discord") {
      return (
        <>
          <div className="settings-modal-header">
            <div>
              <h2>Discord</h2>
              <p>Connect your account to sync Discasa identity data in the future.</p>
            </div>
          </div>

          <div className="settings-card panel-surface-secondary">
            <div className={`settings-status ${sessionName ? "connected" : "disconnected"}`}>
              {sessionName ? "Connected" : "Not connected"}
            </div>
            <button className="pill-button accent-button primary-button" onClick={onOpenDiscordLogin}>
              Login with Discord
            </button>
          </div>
        </>
      );
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
            <div className="settings-field-stack">
              <label className="settings-input-label" htmlFor="accent-hex">
                Accent color (HEX)
              </label>
              <div className="settings-color-row">
                <span className="settings-color-preview" aria-hidden="true" style={{ backgroundColor: accentColor }} />
                <input
                  id="accent-hex"
                  className="form-text-input"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="#E9881D"
                  value={accentInput}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => onAccentInputChange(event.currentTarget.value)}
                  onBlur={onAccentInputBlur}
                />
              </div>
              <span className={`settings-input-help ${accentInputError ? "error" : ""}`}>
                {accentInputError || "A nova cor é aplicada assim que o HEX fica válido."}
              </span>
            </div>
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
        </div>
      </>
    );
  }

  return (
    <div className="settings-modal-root" role="dialog" aria-modal="true" aria-label="Discasa settings">
      <button type="button" className="settings-modal-backdrop" aria-label="Close settings" onClick={onClose} />

      <div className="settings-modal">
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
          <button type="button" className="icon-circle-button modal-close-button settings-modal-close" onClick={onClose} aria-label="Close settings">
            <span className="modal-close-glyph">×</span>
          </button>
          {renderContent()}
        </section>
      </div>
    </div>
  );
}

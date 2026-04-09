import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
  type ReactNode,
  type RefObject,
  type WheelEvent,
} from "react";
import {
  DISCASA_CHANNELS,
  type AlbumRecord,
  type DiscasaAttachmentRecoveryWarning,
  type GuildSummary,
  type LibraryItem,
  type SaveLibraryItemMediaEditInput,
} from "@discasa/shared";
import defaultAvatarUrl from "../assets/discasa-default-avatar.png";
import {
  logoutDiscord,
  clampNumber,
  hexToHsv,
  hsvToHex,
  normalizeHexColor,
  isImage,
  isVideo,
  createViewerDraftStateFromItem,
  getPersistedMediaPresentation,
  hasPendingViewerSave,
  toMediaEditSaveInput,
  commitMouseWheelBehavior,
  readStoredMouseWheelBehavior,
  VIEWER_WHEEL_BEHAVIOR_EVENT,
  type HsvColor,
  type AlbumContextMenuState,
  type GalleryDisplayMode,
  type MouseWheelBehavior,
  type SettingsSection,
  type SidebarView,
  type ViewerDraftState,
  type ViewerState,
  type WindowState,
} from "../lib/Lib";

export function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.75 7.25A1.75 1.75 0 0 1 6.5 5.5h5.2c.41 0 .8.16 1.09.45l1.16 1.15c.17.17.39.27.63.27h2.92a1.75 1.75 0 0 1 1.75 1.75v6.38a1.75 1.75 0 0 1-1.75 1.75h-11A1.75 1.75 0 0 1 4.75 15.5v-8.25Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 11.5h8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 14.5h5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.55 10.55 19.22C5.4 14.54 2 11.46 2 7.7 2 4.76 4.3 2.5 7.2 2.5c1.64 0 3.22.76 4.25 1.96 1.03-1.2 2.61-1.96 4.25-1.96 2.9 0 5.2 2.26 5.2 5.2 0 3.76-3.4 6.84-8.55 11.52L12 20.55Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 7.25h13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 7.25V5.8c0-.72.58-1.3 1.3-1.3h3.4c.72 0 1.3.58 1.3 1.3v1.45" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7.6 7.25v10.05c0 .66.54 1.2 1.2 1.2h6.4c.66 0 1.2-.54 1.2-1.2V7.25" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 10.25v4.5M14 10.25v4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function PictureIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.75" y="6.25" width="14.5" height="11.5" rx="1.75" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m7.8 14.75 2.28-2.6c.25-.29.7-.31.99-.05l1.58 1.42 1.49-1.78c.28-.33.8-.36 1.12-.07l2 1.82" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="9.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.75" y="6.25" width="10.5" height="11.5" rx="1.75" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m15.25 10.15 3.7-2.1v7.9l-3.7-2.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.75 7.25A1.75 1.75 0 0 1 6.5 5.5h4.1c.44 0 .85.18 1.16.48l1.06 1.03c.18.18.43.29.69.29h4a1.75 1.75 0 0 1 1.75 1.75v6.45a1.75 1.75 0 0 1-1.75 1.75h-11A1.75 1.75 0 0 1 4.75 15.5v-8.25Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5.5v13M5.5 12h13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronLeftDoubleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m13.5 6-6 6 6 6M19 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRightDoubleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m10.5 6 6 6-6 6M5 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.14 12.94a7.43 7.43 0 0 0 .05-.94 7.43 7.43 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.6 7.6 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.58.22-1.12.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.43 7.43 0 0 0-.05.94c0 .32.02.63.05.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.41 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54c.58-.22 1.12-.53 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" fill="currentColor" />
    </svg>
  );
}

export function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15.75V6.25" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="m8.5 9.75 3.5-3.5 3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.75 16.25v1a1.5 1.5 0 0 0 1.5 1.5h9.5a1.5 1.5 0 0 0 1.5-1.5v-1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function ZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15 15 19 19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M10.5 8.1v4.8M8.1 10.5h4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function GalleryModeIcon({ mode }: { mode: "free" | "square" }) {
  if (mode === "square") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5.5" y="5.5" width="13" height="13" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 5.5v13M5.5 12h13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.75" y="6.25" width="14.5" height="11.5" rx="2.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 14.75 11.2 11l2.4 2.2 2.4-2.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.1" cy="9.7" r="1.05" fill="currentColor" />
    </svg>
  );
}

export function RestoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 10H4V5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.6 10A8 8 0 1 0 12 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FolderStackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.75 8A1.75 1.75 0 0 1 6.5 6.25h4c.39 0 .77.14 1.07.4l1.06.93c.19.16.42.25.67.25h4.2A1.5 1.5 0 0 1 19 9.33v6.42A1.75 1.75 0 0 1 17.25 17.5h-10.5A1.75 1.75 0 0 1 5 15.75V8.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinejoin="round"
      />
      <path d="M3.75 11.25h9.5" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      <path d="M11.25 9v4.5M9 11.25h4.5" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
    </svg>
  );
}

export function CloseSmallIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7 17 17M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m14.5 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ZoomInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15 15 19 19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M10.5 8.1v4.8M8.1 10.5h4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15 15 19 19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8.1 10.5h4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function RotateLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 9A7 7 0 1 1 5 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RotateRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17 5v4h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 9A7 7 0 1 0 19 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CropIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4.5v10.25A2.25 2.25 0 0 0 9.25 17H19.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 19.5V9.25A2.25 2.25 0 0 0 14.75 7H4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 7H4v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 12A7.5 7.5 0 1 1 12 19.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4.75h9.75L19.25 8v11.25H6Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 4.75v5.5h6v-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 19.25v-4.5h6v4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function RestoreOriginalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 10H4V5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.6 10A8 8 0 1 0 12 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type AlbumContextMenuProps = {
  menu: AlbumContextMenuState;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRename: () => Promise<void>;
  onMoveUp: () => Promise<void>;
  onMoveDown: () => Promise<void>;
  onDelete: () => Promise<void>;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
};

export function AlbumContextMenu({
  menu,
  canMoveUp,
  canMoveDown,
  onRename,
  onMoveUp,
  onMoveDown,
  onDelete,
  onPointerDown,
}: AlbumContextMenuProps) {
  if (!menu) return null;

  return (
    <div
      className="context-menu"
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
      onPointerDown={onPointerDown}
    >
      <button type="button" className="context-menu-item" onClick={() => void onRename()}>
        Rename
      </button>
      <div className="context-menu-separator" />
      <button type="button" className="context-menu-item" onClick={() => void onMoveUp()} disabled={!canMoveUp}>
        Move up
      </button>
      <button type="button" className="context-menu-item" onClick={() => void onMoveDown()} disabled={!canMoveDown}>
        Move down
      </button>
      <div className="context-menu-separator" />
      <button type="button" className="context-menu-item danger" onClick={() => void onDelete()}>
        Delete album
      </button>
    </div>
  );
}

type BaseModalProps = {
  rootClassName: string;
  backdropClassName: string;
  panelClassName: string;
  ariaLabel: string;
  children: ReactNode;
  showCloseButton?: boolean;
  closeButtonClassName?: string;
  closeButtonAriaLabel?: string;
  onClose?: () => void;
};

export function BaseModal({
  rootClassName,
  backdropClassName,
  panelClassName,
  ariaLabel,
  children,
  showCloseButton = false,
  closeButtonClassName = "",
  closeButtonAriaLabel = "Close modal",
  onClose,
}: BaseModalProps) {
  function handlePanelPointerDown(event: ReactMouseEvent<HTMLElement>) {
    event.stopPropagation();
  }

  function handleCloseButtonPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
  }

  const resolvedCloseButtonClassName = [
    "icon-circle-button",
    "modal-close-button",
    closeButtonClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div className={backdropClassName} aria-hidden="true" />

      <div className={panelClassName} onPointerDown={handlePanelPointerDown}>
        {children}

        {showCloseButton && onClose ? (
          <button
            type="button"
            className={resolvedCloseButtonClassName}
            onPointerDown={handleCloseButtonPointerDown}
            onClick={onClose}
            aria-label={closeButtonAriaLabel}
          >
            <span className="modal-close-glyph">×</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

type AlbumModalProps = {
  isCreatingAlbum: boolean;
  newAlbumName: string;
  createAlbumError: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onChangeName: (value: string) => void;
};

export function AlbumModal({
  isCreatingAlbum,
  newAlbumName,
  createAlbumError,
  inputRef,
  onClose,
  onSubmit,
  onChangeName,
}: AlbumModalProps) {
  return (
    <BaseModal
      rootClassName="album-modal-root"
      backdropClassName="album-modal-backdrop"
      panelClassName="album-modal"
      ariaLabel="Create new album"
      showCloseButton
      closeButtonClassName="album-modal-close"
      closeButtonAriaLabel="Close album creation"
      onClose={onClose}
    >
      <form className="album-modal-content" onSubmit={(event) => void onSubmit(event)}>
        <div className="album-modal-header">
          <h2>New album</h2>
          <p>Choose a name for the new folder in the Albums section.</p>
        </div>

        <div className="album-modal-field">
          <label className="album-modal-label" htmlFor="new-album-name">
            Album name
          </label>
          <input
            ref={inputRef}
            id="new-album-name"
            className="form-text-input album-modal-input"
            type="text"
            value={newAlbumName}
            onChange={(event) => onChangeName(event.currentTarget.value)}
            placeholder="Enter the album name"
            autoComplete="off"
            spellCheck={false}
            disabled={isCreatingAlbum}
          />
          {createAlbumError ? <span className="album-modal-error">{createAlbumError}</span> : null}
        </div>

        <div className="album-modal-actions">
          <button type="submit" className="pill-button accent-button album-modal-confirm" disabled={isCreatingAlbum}>
            {isCreatingAlbum ? "Creating..." : "OK"}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}

export type AuthSetupStep = "login" | "waiting" | "select-server" | "invite-bot" | "apply-server";

type AuthSetupModalProps = {
  step: AuthSetupStep;
  guilds: GuildSummary[];
  selectedGuildId: string;
  selectedGuildName: string | null;
  error: string;
  isLoadingGuilds: boolean;
  isApplyingGuild: boolean;
  isCheckingSetup: boolean;
  hasOpenedBotInvite: boolean;
  onStartLogin: () => void;
  onSelectGuild: (guildId: string) => void;
  onConfirmGuild: () => void;
  onBackToLogin: () => void;
  onBackToServerSelection: () => void;
  onRetryGuilds: () => void;
  onOpenBotInvite: () => void;
  onContinueToApply: () => void;
  onApplyGuild: () => void;
};

function WaitingSpinner() {
  return <span className="auth-setup-spinner" aria-hidden="true" />;
}

export function AuthSetupModal({
  step,
  guilds,
  selectedGuildId,
  selectedGuildName,
  error,
  isLoadingGuilds,
  isApplyingGuild,
  isCheckingSetup,
  hasOpenedBotInvite,
  onStartLogin,
  onSelectGuild,
  onConfirmGuild,
  onBackToLogin,
  onBackToServerSelection,
  onRetryGuilds,
  onOpenBotInvite,
  onContinueToApply,
  onApplyGuild,
}: AuthSetupModalProps) {
  function renderLoginStep() {
    return (
      <>
        <div className="auth-setup-header">
          <span className="auth-setup-eyebrow">Discord login required</span>
          <h2>Connect Discasa in your browser</h2>
          <p>
            Discasa will open your default browser so you can log in to Discord outside the app. After the login succeeds,
            Discasa will keep the flow here and guide you through the server setup.
          </p>
        </div>

        <div className="auth-setup-actions">
          <button type="button" className="pill-button accent-button primary-button" onClick={onStartLogin}>
            Login with Discord
          </button>
        </div>
      </>
    );
  }

  function renderWaitingStep() {
    return (
      <>
        <div className="auth-setup-header">
          <span className="auth-setup-eyebrow">Waiting for Discord</span>
          <h2>Finish the login in your browser</h2>
          <p>
            Your default browser was opened for the Discord login. Complete the authentication there. Discasa will detect the
            successful login automatically and continue to the server selection screen.
          </p>
        </div>

        <div className="auth-setup-waiting-card">
          <WaitingSpinner />
          <div className="auth-setup-waiting-copy">
            <strong>Waiting for confirmation...</strong>
            <span>Keep Discasa open while the Discord browser page completes.</span>
          </div>
        </div>

        <div className="auth-setup-actions">
          <button type="button" className="pill-button secondary-button" onClick={onBackToLogin}>
            Back
          </button>
        </div>
      </>
    );
  }

  function renderServerSelectStep() {
    const hasGuilds = guilds.length > 0;

    return (
      <>
        <div className="auth-setup-header">
          <span className="auth-setup-eyebrow">Choose a server</span>
          <h2>Select where Discasa should be applied</h2>
          <p>
            Pick one of the Discord servers where you own the server or have permission to manage it. Discasa will check if
            the bot and the Discasa structure are already present before deciding the next step automatically.
          </p>
        </div>

        <div className="auth-setup-field-stack">
          <label className="auth-setup-label" htmlFor="auth-setup-server-select">
            Available servers
          </label>
          <select
            id="auth-setup-server-select"
            className="auth-setup-select"
            value={selectedGuildId}
            disabled={isLoadingGuilds || isCheckingSetup || !hasGuilds}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => onSelectGuild(event.currentTarget.value)}
          >
            {!hasGuilds ? <option value="">No eligible servers found</option> : null}
            {hasGuilds ? <option value="">Select a server</option> : null}
            {guilds.map((guild) => (
              <option key={guild.id} value={guild.id}>
                {guild.name}
              </option>
            ))}
          </select>
          <span className={`auth-setup-help ${error ? "error" : ""}`}>
            {error || "Select the server that should host the Discasa channels."}
          </span>
        </div>

        <div className="auth-setup-actions spaced">
          <button
            type="button"
            className="pill-button secondary-button"
            onClick={onRetryGuilds}
            disabled={isCheckingSetup}
          >
            Refresh list
          </button>
          <button
            type="button"
            className="pill-button accent-button primary-button"
            onClick={onConfirmGuild}
            disabled={!selectedGuildId || isCheckingSetup}
          >
            {isCheckingSetup ? "Checking..." : "OK"}
          </button>
        </div>
      </>
    );
  }

  function renderInviteBotStep() {
    return (
      <>
        <div className="auth-setup-header">
          <span className="auth-setup-eyebrow">Invite the bot</span>
          <h2>Add the Discasa bot to {selectedGuildName ?? "the selected server"}</h2>
          <p>
            Before applying Discasa, invite the bot to the selected server in your browser. After finishing the Discord
            authorization, return here and let Discasa confirm that the bot is really present before continuing.
          </p>
        </div>

        <span className={`auth-setup-help ${error ? "error" : ""}`}>
          {error || "Use the invite button below, complete the Discord authorization, then continue."}
        </span>

        <div className="auth-setup-actions spaced">
          <button type="button" className="pill-button secondary-button" onClick={onBackToServerSelection}>
            Back
          </button>
          <button type="button" className="pill-button secondary-button" onClick={onOpenBotInvite}>
            {hasOpenedBotInvite ? "Open invite again" : "Invite bot"}
          </button>
          <button
            type="button"
            className="pill-button accent-button primary-button"
            onClick={onContinueToApply}
            disabled={!selectedGuildId || !hasOpenedBotInvite || isCheckingSetup}
          >
            {isCheckingSetup ? "Checking..." : "Continue"}
          </button>
        </div>
      </>
    );
  }

  function renderApplyStep() {
    return (
      <>
        <div className="auth-setup-header">
          <span className="auth-setup-eyebrow">Apply Discasa</span>
          <h2>Ready to configure {selectedGuildName ?? "the selected server"}</h2>
          <p>
            Discasa stores your library inside Discord. When you apply it, the app creates a dedicated category and the
            channels below so your files, folders, trash and settings stay organized in that server.
          </p>
        </div>

        <div className="auth-setup-channel-list">
          {DISCASA_CHANNELS.map((channelName) => (
            <div key={channelName} className="auth-setup-channel-item">
              <span className="auth-setup-channel-hash">#</span>
              <span>{channelName}</span>
            </div>
          ))}
        </div>

        <span className={`auth-setup-help ${error ? "error" : ""}`}>
          {error || "Click Apply Discasa to create or reuse the required channels in the selected server."}
        </span>

        <div className="auth-setup-actions spaced">
          <button type="button" className="pill-button secondary-button" onClick={onBackToServerSelection}>
            Back
          </button>
          <button
            type="button"
            className="pill-button accent-button primary-button"
            onClick={onApplyGuild}
            disabled={!selectedGuildId || isApplyingGuild}
          >
            {isApplyingGuild ? "Applying..." : "Apply Discasa"}
          </button>
        </div>
      </>
    );
  }

  return (
    <BaseModal
      rootClassName="auth-setup-modal-root"
      backdropClassName="auth-setup-modal-backdrop"
      panelClassName="auth-setup-modal"
      ariaLabel="Discasa setup"
    >
      <div className="auth-setup-shell">
        {step === "login" ? renderLoginStep() : null}
        {step === "waiting" ? renderWaitingStep() : null}
        {step === "select-server" ? renderServerSelectStep() : null}
        {step === "invite-bot" ? renderInviteBotStep() : null}
        {step === "apply-server" ? renderApplyStep() : null}
      </div>
    </BaseModal>
  );
}

type BulkActionBarProps = {
  selectedCount: number;
  isBusy: boolean;
  isTrashSelection: boolean;
  isAllSelectedFavorite: boolean;
  onToggleFavorite: () => void;
  onMoveToTrash: () => void;
  onRestore: () => void;
  onClearSelection: () => void;
};

export function BulkActionBar({
  selectedCount,
  isBusy,
  isTrashSelection,
  isAllSelectedFavorite,
  onToggleFavorite,
  onMoveToTrash,
  onRestore,
  onClearSelection,
}: BulkActionBarProps) {
  if (selectedCount <= 0) {
    return null;
  }

  return (
    <div className="bulk-action-bar" aria-label={`${selectedCount} item(s) selected`}>
      <span className="bulk-selection-count">{selectedCount} selected</span>

      {isTrashSelection ? (
        <>
          <button
            type="button"
            className="bulk-action-button"
            onClick={onRestore}
            disabled={isBusy}
            title="Restore selected"
          >
            <span className="bulk-action-icon" aria-hidden="true">
              <RestoreIcon />
            </span>
            <span className="bulk-action-label">Restore</span>
          </button>

          <button
            type="button"
            className="bulk-action-button disabled"
            disabled
            title="Bulk permanent delete will be enabled in the next step."
          >
            <span className="bulk-action-icon" aria-hidden="true">
              <TrashIcon />
            </span>
            <span className="bulk-action-label">Delete</span>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className={`bulk-action-button ${isAllSelectedFavorite ? "active" : ""}`}
            onClick={onToggleFavorite}
            disabled={isBusy}
            title={isAllSelectedFavorite ? "Remove selected items from favorites" : "Add selected items to favorites"}
          >
            <span className="bulk-action-icon" aria-hidden="true">
              <HeartIcon />
            </span>
            <span className="bulk-action-label">{isAllSelectedFavorite ? "Unfavorite" : "Favorite"}</span>
          </button>

          <button
            type="button"
            className="bulk-action-button disabled"
            disabled
            title="Bulk move to album will be enabled when album membership endpoints are ready."
          >
            <span className="bulk-action-icon" aria-hidden="true">
              <FolderStackIcon />
            </span>
            <span className="bulk-action-label">Move</span>
          </button>

          <button
            type="button"
            className="bulk-action-button danger"
            onClick={onMoveToTrash}
            disabled={isBusy}
            title="Move selected items to the trash"
          >
            <span className="bulk-action-icon" aria-hidden="true">
              <TrashIcon />
            </span>
            <span className="bulk-action-label">Trash</span>
          </button>
        </>
      )}

      <button
        type="button"
        className="bulk-action-clear"
        onClick={onClearSelection}
        disabled={isBusy}
        aria-label="Clear selection"
        title="Clear selection"
      >
        <CloseSmallIcon />
      </button>
    </div>
  );
}

type DeleteAlbumModalProps = {
  albumName: string;
  isDeleting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function DeleteAlbumModal({
  albumName,
  isDeleting,
  error,
  onClose,
  onConfirm,
}: DeleteAlbumModalProps) {
  return (
    <BaseModal
      rootClassName="album-modal-root"
      backdropClassName="album-modal-backdrop"
      panelClassName="album-modal delete-album-modal"
      ariaLabel="Delete album confirmation"
    >
      <div className="delete-album-modal-content">
        <div className="album-modal-header delete-album-modal-header">
          <h2>Delete album</h2>
          <p>Delete the album “{albumName}”?</p>
        </div>

        <p className="delete-album-modal-copy">
          This removes the album from the sidebar, but the files stay in your library.
        </p>

        {error ? <span className="album-modal-error">{error}</span> : null}

        <div className="delete-album-modal-actions">
          <button
            type="button"
            className="pill-button secondary-button delete-album-modal-cancel"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="pill-button danger-button delete-album-modal-confirm"
            onClick={() => void onConfirm()}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}

type DeleteFileModalProps = {
  fileName: string;
  isDeleting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function DeleteFileModal({
  fileName,
  isDeleting,
  error,
  onClose,
  onConfirm,
}: DeleteFileModalProps) {
  return (
    <BaseModal
      rootClassName="album-modal-root"
      backdropClassName="album-modal-backdrop"
      panelClassName="album-modal delete-album-modal"
      ariaLabel="Delete file confirmation"
    >
      <div className="delete-album-modal-content">
        <div className="album-modal-header delete-album-modal-header">
          <h2>Delete file</h2>
          <p>Delete “{fileName}” permanently?</p>
        </div>

        <p className="delete-album-modal-copy">
          This permanently removes the file from your library. This action cannot be undone.
        </p>

        {error ? <span className="album-modal-error">{error}</span> : null}

        <div className="delete-album-modal-actions">
          <button
            type="button"
            className="pill-button secondary-button delete-album-modal-cancel"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="pill-button danger-button delete-album-modal-confirm"
            onClick={() => void onConfirm()}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}

type ProfileAvatarProps = {
  avatarUrl: string | null;
  className: string;
};

export function ProfileAvatar({ avatarUrl, className }: ProfileAvatarProps) {
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [avatarUrl]);

  const showDiscordAvatar = Boolean(avatarUrl) && !hasImageError;

  return (
    <div className={`${className} avatar-base ${showDiscordAvatar ? "has-discord-avatar" : ""}`} aria-hidden="true">
      {showDiscordAvatar ? (
        <img src={avatarUrl ?? undefined} alt="" className="avatar-image" onError={() => setHasImageError(true)} />
      ) : (
        <div className="avatar-fallback">
          <span className="avatar-fallback-background" />
          <img src={defaultAvatarUrl} alt="" className="avatar-fallback-image" />
        </div>
      )}
    </div>
  );
}

type GalleryProps = {
  title: string;
  description: string;
  items: LibraryItem[];
  attachmentWarnings: DiscasaAttachmentRecoveryWarning[];
  selectedItemIds: string[];
  isBusy: boolean;
  isDraggingFiles: boolean;
  thumbnailSize: number;
  thumbnailZoomIndex: number;
  thumbnailZoomLevelCount: number;
  thumbnailZoomPercent: number;
  onThumbnailZoomIndexChange: (nextIndex: number) => void;
  onSelectItem: (itemId: string, options: { range: boolean; toggle: boolean }) => void;
  onClearSelection: () => void;
  onApplySelectionRect: (itemIds: string[], mode: "replace" | "add") => void;
  onRequestUpload: () => void;
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => Promise<void>;
  onToggleFavorite: (itemId: string) => Promise<void>;
  onMoveToTrash: (itemId: string) => Promise<void>;
  onRestoreFromTrash: (itemId: string) => Promise<void>;
  onSaveMediaEdit: (itemId: string, input: SaveLibraryItemMediaEditInput) => Promise<LibraryItem>;
  onRestoreMediaEdit: (itemId: string) => Promise<LibraryItem>;
  onDeleteItem: (itemId: string) => Promise<void>;
};

type LibraryToolbarProps = {
  galleryDisplayMode: GalleryDisplayMode;
  thumbnailZoomIndex: number;
  thumbnailZoomLevelCount: number;
  thumbnailZoomPercent: number;
  thumbnailZoomProgress: number;
  bulkActions?: ReactNode;
  onThumbnailZoomIndexChange: (nextIndex: number) => void;
  onToggleGalleryDisplayMode: () => void;
  onRequestUpload: () => void;
};

type SelectionBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type SelectionSession = {
  startClientX: number;
  startClientY: number;
  additive: boolean;
  initialSelectedIds: string[];
  itemRects: Array<{ id: string; rect: DOMRect }>;
  hasExceededThreshold: boolean;
};

type GalleryGridProps = {
  items: LibraryItem[];
  isBusy: boolean;
  displayMode: GalleryDisplayMode;
  thumbnailSize: number;
  selectedItemIds: string[];
  onSelectItem: (itemId: string, options: { range: boolean; toggle: boolean }) => void;
  onOpenItem: (itemId: string) => void;
  onClearSelection: () => void;
  onApplySelectionRect: (itemIds: string[], mode: "replace" | "add") => void;
  renderItemActions: (item: LibraryItem) => ReactNode;
  onRequestUpload: () => void;
};

type GalleryItemProps = {
  item: LibraryItem;
  isSelected: boolean;
  displayMode: GalleryDisplayMode;
  actions: ReactNode;
  onClick: (event: ReactMouseEvent<HTMLElement>, itemId: string) => void;
  onDoubleClick: (itemId: string) => void;
  onRegisterElement: (itemId: string, element: HTMLElement | null) => void;
};

const SELECTION_DRAG_THRESHOLD = 4;
const bytesFormatter = new Intl.NumberFormat("en-US");
const MIN_FREE_PREVIEW_ASPECT_RATIO = 0.82;
const MAX_FREE_PREVIEW_ASPECT_RATIO = 1.28;

const previewMediaStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "block",
  background: "rgba(3, 10, 22, 0.88)",
};

const previewShadeStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  background: "linear-gradient(180deg, rgba(5, 10, 18, 0.02) 0%, rgba(5, 10, 18, 0.01) 45%, rgba(5, 10, 18, 0.22) 100%)",
};

const previewFallbackStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "10px",
  padding: "18px",
  textAlign: "center",
  background: "radial-gradient(circle at top, rgba(233, 136, 29, 0.14) 0%, rgba(8, 14, 24, 0.78) 44%, rgba(4, 8, 15, 0.96) 100%)",
};

const previewExtensionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "70px",
  minHeight: "70px",
  padding: "12px",
  borderRadius: "18px",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  background: "rgba(255, 255, 255, 0.06)",
  color: "rgba(255, 255, 255, 0.94)",
  fontSize: "18px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.05)",
};

const previewCaptionStyle: CSSProperties = {
  display: "block",
  maxWidth: "100%",
  color: "rgba(255, 255, 255, 0.58)",
  fontSize: "11px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const editedBadgeStyle: CSSProperties = {
  position: "absolute",
  left: "10px",
  top: "10px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "22px",
  padding: "0 8px",
  borderRadius: "999px",
  background: "rgba(var(--accent-rgb), 0.22)",
  color: "rgba(255, 255, 255, 0.96)",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  pointerEvents: "none",
};

function getFileExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const parts = trimmed.split(".");

  if (parts.length < 2) {
    return "FILE";
  }

  const extension = parts.pop()?.trim().toUpperCase();
  if (!extension) {
    return "FILE";
  }

  return extension.slice(0, 5);
}

function getFallbackLabel(item: LibraryItem): string {
  if (item.mimeType.startsWith("audio/")) {
    return "AUDIO";
  }

  if (item.mimeType === "application/pdf") {
    return "PDF";
  }

  if (item.mimeType.includes("zip") || item.mimeType.includes("compressed")) {
    return "ARCHIVE";
  }

  if (item.mimeType.startsWith("text/")) {
    return "TEXT";
  }

  return item.mimeType.split("/")[0]?.toUpperCase() || "FILE";
}

function formatVideoDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function resolveFallbackAspectRatio(item: LibraryItem): number {
  if (isVideo(item)) {
    return 16 / 9;
  }

  if (isImage(item)) {
    return 4 / 3;
  }

  return 1;
}

function clampFreePreviewAspectRatio(value: number): number {
  return Math.min(MAX_FREE_PREVIEW_ASPECT_RATIO, Math.max(MIN_FREE_PREVIEW_ASPECT_RATIO, value));
}

function rectanglesIntersect(left: DOMRect, right: DOMRect): boolean {
  return !(
    left.right < right.left ||
    left.left > right.right ||
    left.bottom < right.top ||
    left.top > right.bottom
  );
}

function createViewportSelectionRect(startClientX: number, startClientY: number, currentClientX: number, currentClientY: number): DOMRect {
  const left = Math.min(startClientX, currentClientX);
  const top = Math.min(startClientY, currentClientY);
  const width = Math.abs(currentClientX - startClientX);
  const height = Math.abs(currentClientY - startClientY);

  return new DOMRect(left, top, width, height);
}

function stopActionEvent(event: ReactMouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>): void {
  event.stopPropagation();
}

function LibraryToolbar({
  galleryDisplayMode,
  thumbnailZoomIndex,
  thumbnailZoomLevelCount,
  thumbnailZoomPercent,
  thumbnailZoomProgress,
  bulkActions,
  onThumbnailZoomIndexChange,
  onToggleGalleryDisplayMode,
  onRequestUpload,
}: LibraryToolbarProps) {
  function handleThumbnailZoomChange(event: ChangeEvent<HTMLInputElement>): void {
    onThumbnailZoomIndexChange(Number(event.currentTarget.value));
  }

  const nextModeLabel = galleryDisplayMode === "free" ? "Enable square crop mode" : "Enable free aspect mode";

  return (
    <div className="library-tools">
      <div className={`library-view-controls ${bulkActions ? "has-bulk-actions" : ""}`}>
        <label
          className="thumbnail-zoom-control compact"
          title={`Thumbnail zoom: ${thumbnailZoomPercent}%`}
          style={{ "--thumbnail-zoom-progress": `${thumbnailZoomProgress}%` } as CSSProperties}
        >
          <span className="thumbnail-zoom-icon" aria-hidden="true">
            <ZoomIcon />
          </span>
          <input
            className="thumbnail-zoom-slider"
            type="range"
            min={0}
            max={thumbnailZoomLevelCount - 1}
            step={1}
            value={thumbnailZoomIndex}
            onChange={handleThumbnailZoomChange}
            aria-label={`Thumbnail zoom ${thumbnailZoomPercent}%`}
          />
        </label>

        <button
          type="button"
          className="icon-circle-button gallery-mode-button"
          onClick={onToggleGalleryDisplayMode}
          aria-label={nextModeLabel}
          title={nextModeLabel}
        >
          <GalleryModeIcon mode={galleryDisplayMode} />
        </button>

        {bulkActions}
      </div>

      <button type="button" className="icon-circle-button upload-button" onClick={onRequestUpload} aria-label="Upload" title="Upload">
        <UploadIcon />
      </button>
    </div>
  );
}

function FileThumbnail({ item, displayMode, actions }: { item: LibraryItem; displayMode: GalleryDisplayMode; actions: ReactNode }) {
  const [hasPreviewError, setHasPreviewError] = useState(false);
  const [mediaAspectRatio, setMediaAspectRatio] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState<string>("");

  const extension = useMemo(() => getFileExtension(item.name), [item.name]);
  const fallbackLabel = useMemo(() => getFallbackLabel(item), [item]);
  const canRenderImage = isImage(item) && !hasPreviewError;
  const canRenderVideo = isVideo(item) && !hasPreviewError;
  const persistedMediaPresentation = useMemo(() => getPersistedMediaPresentation(item), [item]);
  const hasSavedEdit = Boolean(item.savedMediaEdit);

  useEffect(() => {
    if (!canRenderImage || displayMode !== "free") {
      return;
    }

    let isDisposed = false;
    const image = new Image();

    image.onload = () => {
      if (isDisposed || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        return;
      }

      setMediaAspectRatio(image.naturalWidth / image.naturalHeight);
    };

    image.onerror = () => {
      if (!isDisposed) {
        setMediaAspectRatio(null);
      }
    };

    image.src = item.attachmentUrl;

    return () => {
      isDisposed = true;
    };
  }, [canRenderImage, displayMode, item.attachmentUrl]);

  const previewAspectRatio =
    displayMode === "square"
      ? 1
      : clampFreePreviewAspectRatio(mediaAspectRatio ?? resolveFallbackAspectRatio(item));

  return (
    <div className="file-card" title={item.name}>
      <div className="file-preview" style={{ aspectRatio: `${previewAspectRatio}` }}>
        {canRenderImage ? (
          <>
            <img
              src={item.attachmentUrl}
              alt={item.name}
              loading="lazy"
              draggable={false}
              style={{
                ...previewMediaStyle,
                objectFit: displayMode === "square" || persistedMediaPresentation.hasCrop ? "cover" : "contain",
                transform: `rotate(${persistedMediaPresentation.rotationDegrees}deg)`,
              }}
              onError={() => setHasPreviewError(true)}
            />
            <div aria-hidden="true" style={previewShadeStyle} />
          </>
        ) : null}

        {canRenderVideo ? (
          <>
            <video
              src={item.attachmentUrl}
              preload="metadata"
              muted
              playsInline
              disablePictureInPicture
              controls={false}
              style={{
                ...previewMediaStyle,
                objectFit: displayMode === "square" ? "cover" : "contain",
              }}
              onLoadedMetadata={(event) => {
                const target = event.currentTarget;
                if (displayMode === "free" && target.videoWidth > 0 && target.videoHeight > 0) {
                  setMediaAspectRatio(target.videoWidth / target.videoHeight);
                }
                setVideoDuration(formatVideoDuration(target.duration));
              }}
              onError={() => setHasPreviewError(true)}
            />
            <div aria-hidden="true" style={previewShadeStyle} />
            <span className="file-video-duration" aria-label={`Video duration ${videoDuration || "0:00"}`}>
              {videoDuration || "0:00"}
            </span>
          </>
        ) : null}

        {!canRenderImage && !canRenderVideo ? (
          <div aria-hidden="true" style={previewFallbackStyle}>
            <span style={previewExtensionStyle}>{extension}</span>
            <span style={previewCaptionStyle}>{fallbackLabel}</span>
          </div>
        ) : null}

        {hasSavedEdit ? <span style={editedBadgeStyle}>Edited</span> : null}
        <div className="file-preview-actions">{actions}</div>
      </div>
    </div>
  );
}

function GalleryItem({ item, isSelected, displayMode, actions, onClick, onDoubleClick, onRegisterElement }: GalleryItemProps) {
  return (
    <article
      ref={(element) => onRegisterElement(item.id, element)}
      className={`file-tile mode-${displayMode} ${isSelected ? "selected" : ""}`}
      title={item.name}
      onClick={(event) => onClick(event, item.id)}
      onDoubleClick={() => onDoubleClick(item.id)}
    >
      <FileThumbnail item={item} displayMode={displayMode} actions={actions} />
      <div className="file-meta compact">
        <span className="file-name">{item.name}</span>
        <small className="file-size">{bytesFormatter.format(item.size)} bytes</small>
      </div>
    </article>
  );
}

function GalleryGrid({
  items,
  isBusy,
  displayMode,
  thumbnailSize,
  selectedItemIds,
  onSelectItem,
  onOpenItem,
  onClearSelection,
  onApplySelectionRect,
  renderItemActions,
  onRequestUpload,
}: GalleryGridProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const itemElementMapRef = useRef(new Map<string, HTMLElement>());
  const selectionSessionRef = useRef<SelectionSession | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

  const selectedItemIdSet = new Set(selectedItemIds);

  function setItemElement(itemId: string, element: HTMLElement | null): void {
    if (element) {
      itemElementMapRef.current.set(itemId, element);
      return;
    }

    itemElementMapRef.current.delete(itemId);
  }

  function handleItemClick(event: ReactMouseEvent<HTMLElement>, itemId: string): void {
    onSelectItem(itemId, {
      range: event.shiftKey,
      toggle: event.ctrlKey || event.metaKey,
    });
  }

  function handleItemDoubleClick(itemId: string): void {
    if (isBusy) {
      return;
    }

    onOpenItem(itemId);
  }

  function updateSelectionBox(currentClientX: number, currentClientY: number): void {
    const gridElement = gridRef.current;
    const session = selectionSessionRef.current;

    if (!gridElement || !session) {
      return;
    }

    const viewportRect = createViewportSelectionRect(
      session.startClientX,
      session.startClientY,
      currentClientX,
      currentClientY,
    );
    const gridViewportRect = gridElement.getBoundingClientRect();
    const hitItemIds = session.itemRects
      .filter(({ rect }) => rectanglesIntersect(viewportRect, rect))
      .map(({ id }) => id);
    const nextSelectedIds = session.additive
      ? Array.from(new Set([...session.initialSelectedIds, ...hitItemIds]))
      : hitItemIds;

    setSelectionBox({
      left: viewportRect.left - gridViewportRect.left + gridElement.scrollLeft,
      top: viewportRect.top - gridViewportRect.top + gridElement.scrollTop,
      width: viewportRect.width,
      height: viewportRect.height,
    });
    onApplySelectionRect(nextSelectedIds, "replace");
  }

  function handleGridPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || event.target !== event.currentTarget || items.length === 0) {
      return;
    }

    event.preventDefault();

    selectionSessionRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      additive: event.ctrlKey || event.metaKey,
      initialSelectedIds: selectedItemIds,
      itemRects: items
        .map((item) => {
          const element = itemElementMapRef.current.get(item.id);
          if (!element) {
            return null;
          }

          return {
            id: item.id,
            rect: element.getBoundingClientRect(),
          };
        })
        .filter((entry): entry is { id: string; rect: DOMRect } => Boolean(entry)),
      hasExceededThreshold: false,
    };

    const handleWindowPointerMove = (moveEvent: PointerEvent) => {
      const session = selectionSessionRef.current;
      if (!session) {
        return;
      }

      const deltaX = Math.abs(moveEvent.clientX - session.startClientX);
      const deltaY = Math.abs(moveEvent.clientY - session.startClientY);
      const hasExceededThreshold = deltaX >= SELECTION_DRAG_THRESHOLD || deltaY >= SELECTION_DRAG_THRESHOLD;

      if (!hasExceededThreshold) {
        return;
      }

      session.hasExceededThreshold = true;
      updateSelectionBox(moveEvent.clientX, moveEvent.clientY);
    };

    const handleWindowPointerUp = (upEvent: PointerEvent) => {
      const session = selectionSessionRef.current;

      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);

      if (!session) {
        setSelectionBox(null);
        return;
      }

      if (session.hasExceededThreshold) {
        updateSelectionBox(upEvent.clientX, upEvent.clientY);
      } else if (!session.additive) {
        onClearSelection();
      }

      selectionSessionRef.current = null;
      setSelectionBox(null);
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
  }

  return (
    <div
      ref={gridRef}
      className={`files-grid display-${displayMode} scrollable-y subtle-scrollbar content-scrollbar-host ${selectionBox ? "selecting" : ""}`}
      style={{ "--file-card-width": `${thumbnailSize}px` } as CSSProperties}
      onPointerDown={handleGridPointerDown}
    >
      {items.map((item) => (
        <GalleryItem
          key={item.id}
          item={item}
          isSelected={selectedItemIdSet.has(item.id)}
          displayMode={displayMode}
          actions={renderItemActions(item)}
          onClick={handleItemClick}
          onDoubleClick={handleItemDoubleClick}
          onRegisterElement={setItemElement}
        />
      ))}

      {selectionBox ? (
        <div
          className="selection-box"
          aria-hidden="true"
          style={{
            left: `${selectionBox.left}px`,
            top: `${selectionBox.top}px`,
            width: `${selectionBox.width}px`,
            height: `${selectionBox.height}px`,
          }}
        />
      ) : null}

      {items.length === 0 && !isBusy ? (
        <button type="button" className="empty-state" onClick={onRequestUpload}>
          <span className="empty-state-title">No files yet.</span>
          <span className="empty-state-copy">Drag files from Explorer into this area or click the upload button to add files.</span>
        </button>
      ) : null}
    </div>
  );
}

export function Gallery({
  title,
  description,
  items,
  attachmentWarnings,
  selectedItemIds,
  isBusy,
  isDraggingFiles,
  thumbnailSize,
  thumbnailZoomIndex,
  thumbnailZoomLevelCount,
  thumbnailZoomPercent,
  onThumbnailZoomIndexChange,
  onSelectItem,
  onClearSelection,
  onApplySelectionRect,
  onRequestUpload,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onToggleFavorite,
  onMoveToTrash,
  onRestoreFromTrash,
  onSaveMediaEdit,
  onRestoreMediaEdit,
  onDeleteItem,
}: GalleryProps) {
  const [galleryDisplayMode, setGalleryDisplayMode] = useState<GalleryDisplayMode>("free");
  const [viewerState, setViewerState] = useState<ViewerState>(null);
  const [viewerWheelBehavior, setViewerWheelBehavior] = useState<MouseWheelBehavior>(() => readStoredMouseWheelBehavior());
  const [viewerDraftState, setViewerDraftState] = useState<ViewerDraftState>(() => createViewerDraftStateFromItem(null));
  const [isSavingViewerEdit, setIsSavingViewerEdit] = useState(false);
  const [viewerSaveError, setViewerSaveError] = useState("");
  const [viewerSaveNotice, setViewerSaveNotice] = useState("");

  const displayItems = items;

  const thumbnailZoomProgress = useMemo(() => {
    if (thumbnailZoomLevelCount <= 1) {
      return 0;
    }

    return (thumbnailZoomIndex / (thumbnailZoomLevelCount - 1)) * 100;
  }, [thumbnailZoomIndex, thumbnailZoomLevelCount]);

  const selectedItemIdSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const selectedItems = useMemo(
    () => displayItems.filter((item) => selectedItemIdSet.has(item.id)),
    [displayItems, selectedItemIdSet],
  );

  const isTrashSelection = selectedItems.length > 0 && selectedItems.every((item) => item.isTrashed);
  const allSelectedAreFavorite = selectedItems.length > 0 && selectedItems.every((item) => item.isFavorite);

  const activeViewerIndex = useMemo(() => {
    if (!viewerState) {
      return -1;
    }

    return displayItems.findIndex((item) => item.id === viewerState.itemId);
  }, [displayItems, viewerState]);

  const activeViewerItem = activeViewerIndex >= 0 ? displayItems[activeViewerIndex] ?? null : null;
  const activeViewerSavedEditKey = activeViewerItem?.savedMediaEdit
    ? `${activeViewerItem.savedMediaEdit.rotationDegrees}:${activeViewerItem.savedMediaEdit.hasCrop}:${activeViewerItem.savedMediaEdit.savedAt}`
    : "none";
  const viewerHasPendingSave = hasPendingViewerSave(activeViewerItem, viewerDraftState);

  useEffect(() => {
    const handleViewerWheelBehaviorChange = (event: Event) => {
      const customEvent = event as CustomEvent<MouseWheelBehavior>;
      if (customEvent.detail === "navigate" || customEvent.detail === "zoom") {
        setViewerWheelBehavior(customEvent.detail);
      } else {
        setViewerWheelBehavior(readStoredMouseWheelBehavior());
      }
    };

    window.addEventListener(VIEWER_WHEEL_BEHAVIOR_EVENT, handleViewerWheelBehaviorChange as EventListener);
    return () => window.removeEventListener(VIEWER_WHEEL_BEHAVIOR_EVENT, handleViewerWheelBehaviorChange as EventListener);
  }, []);

  useEffect(() => {
    if (!viewerSaveNotice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setViewerSaveNotice("");
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [viewerSaveNotice]);

  useEffect(() => {
    if (!viewerSaveError) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setViewerSaveError("");
    }, 4200);

    return () => window.clearTimeout(timeoutId);
  }, [viewerSaveError]);

  useEffect(() => {
    if (!viewerState) {
      setViewerDraftState(createViewerDraftStateFromItem(null));
      setViewerSaveError("");
      setViewerSaveNotice("");
      return;
    }

    if (!activeViewerItem) {
      setViewerState(null);
      return;
    }

    setViewerDraftState(createViewerDraftStateFromItem(activeViewerItem));
    setViewerSaveError("");
    setViewerSaveNotice("");
  }, [viewerState, activeViewerItem?.id, activeViewerSavedEditKey]);

  useEffect(() => {
    if (!viewerState) {
      return;
    }

    if (displayItems.length === 0) {
      setViewerState(null);
      return;
    }

    const nextIndex = displayItems.findIndex((item) => item.id === viewerState.itemId);
    if (nextIndex === -1) {
      setViewerState(null);
      return;
    }

    if (viewerState.index !== nextIndex || viewerState.total !== displayItems.length) {
      setViewerState({
        itemId: displayItems[nextIndex]?.id ?? viewerState.itemId,
        index: nextIndex,
        total: displayItems.length,
      });
    }
  }, [displayItems, viewerState]);

  async function handleBulkFavoriteToggle(): Promise<void> {
    if (isBusy || selectedItems.length === 0) {
      return;
    }

    const nextFavoriteState = !allSelectedAreFavorite;
    const targets = selectedItems.filter((item) => item.isFavorite !== nextFavoriteState);

    for (const item of targets) {
      await onToggleFavorite(item.id);
    }
  }

  async function handleBulkMoveToTrash(): Promise<void> {
    if (isBusy || selectedItems.length === 0) {
      return;
    }

    const targets = selectedItems.filter((item) => !item.isTrashed);

    for (const item of targets) {
      await onMoveToTrash(item.id);
    }
  }

  async function handleBulkRestore(): Promise<void> {
    if (isBusy || selectedItems.length === 0) {
      return;
    }

    const targets = selectedItems.filter((item) => item.isTrashed);

    for (const item of targets) {
      await onRestoreFromTrash(item.id);
    }
  }

  function handleOpenViewer(itemId: string): void {
    const index = displayItems.findIndex((item) => item.id === itemId);

    if (index === -1) {
      return;
    }

    setViewerState({
      itemId,
      index,
      total: displayItems.length,
    });
  }

  function handleCloseViewer(): void {
    setViewerState(null);
  }

  function handleNavigateViewer(direction: "previous" | "next"): void {
    if (!viewerState) {
      return;
    }

    const currentIndex = displayItems.findIndex((item) => item.id === viewerState.itemId);
    if (currentIndex === -1) {
      return;
    }

    const nextIndex = direction === "previous" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= displayItems.length) {
      return;
    }

    setViewerState({
      itemId: displayItems[nextIndex]?.id ?? viewerState.itemId,
      index: nextIndex,
      total: displayItems.length,
    });
  }

  async function handleSaveViewerEdit(): Promise<void> {
    if (!activeViewerItem || !activeViewerItem.mimeType.startsWith("image/") || isSavingViewerEdit || !viewerHasPendingSave) {
      return;
    }

    setIsSavingViewerEdit(true);
    setViewerSaveError("");
    setViewerSaveNotice("");

    try {
      const nextItem = await onSaveMediaEdit(activeViewerItem.id, toMediaEditSaveInput(viewerDraftState));
      setViewerDraftState(createViewerDraftStateFromItem(nextItem));
      setViewerSaveNotice(nextItem.savedMediaEdit ? "Edits saved for this image." : "Image restored to the original view.");
    } catch (caughtError) {
      setViewerSaveError(caughtError instanceof Error ? caughtError.message : "Could not save the image edits.");
    } finally {
      setIsSavingViewerEdit(false);
    }
  }

  async function handleRestoreViewerOriginal(): Promise<void> {
    if (!activeViewerItem || !activeViewerItem.mimeType.startsWith("image/") || isSavingViewerEdit || !activeViewerItem.savedMediaEdit) {
      return;
    }

    setIsSavingViewerEdit(true);
    setViewerSaveError("");
    setViewerSaveNotice("");

    try {
      const nextItem = await onRestoreMediaEdit(activeViewerItem.id);
      setViewerDraftState(createViewerDraftStateFromItem(nextItem));
      setViewerSaveNotice("Original restored for this image.");
    } catch (caughtError) {
      setViewerSaveError(caughtError instanceof Error ? caughtError.message : "Could not restore the original image.");
    } finally {
      setIsSavingViewerEdit(false);
    }
  }

  function renderThumbnailActions(item: LibraryItem) {
    if (item.isTrashed) {
      return (
        <>
          <button
            type="button"
            className="file-icon-button"
            onPointerDown={stopActionEvent}
            onClick={(event) => {
              stopActionEvent(event);
              void onRestoreFromTrash(item.id);
            }}
            aria-label="Restore"
            title="Restore"
          >
            <RestoreIcon />
          </button>
          <button
            type="button"
            className="file-icon-button danger"
            onPointerDown={stopActionEvent}
            onClick={(event) => {
              stopActionEvent(event);
              void onDeleteItem(item.id);
            }}
            aria-label="Delete permanently"
            title="Delete permanently"
          >
            <TrashIcon />
          </button>
        </>
      );
    }

    return (
      <>
        <button
          type="button"
          className={`file-icon-button ${item.isFavorite ? "active" : ""}`}
          onPointerDown={stopActionEvent}
          onClick={(event) => {
            stopActionEvent(event);
            void onToggleFavorite(item.id);
          }}
          aria-label={item.isFavorite ? "Unfavorite" : "Favorite"}
          title={item.isFavorite ? "Unfavorite" : "Favorite"}
        >
          <HeartIcon />
        </button>
        <button
          type="button"
          className="file-icon-button danger"
          onPointerDown={stopActionEvent}
          onClick={(event) => {
            stopActionEvent(event);
            void onMoveToTrash(item.id);
          }}
          aria-label="Move to trash"
          title="Move to trash"
        >
          <TrashIcon />
        </button>
      </>
    );
  }

  const bulkActions =
    selectedItems.length > 0 ? (
      <BulkActionBar
        selectedCount={selectedItems.length}
        isBusy={isBusy}
        isTrashSelection={isTrashSelection}
        isAllSelectedFavorite={allSelectedAreFavorite}
        onToggleFavorite={() => {
          void handleBulkFavoriteToggle();
        }}
        onMoveToTrash={() => {
          void handleBulkMoveToTrash();
        }}
        onRestore={() => {
          void handleBulkRestore();
        }}
        onClearSelection={onClearSelection}
      />
    ) : null;

  const unresolvedWarningMessage =
    attachmentWarnings.length > 0
      ? `${attachmentWarnings.length} file link${attachmentWarnings.length === 1 ? "" : "s"} could not be restored from Discord and may appear unavailable.`
      : "";

  return (
    <main
      className={`library-panel panel-surface ${isDraggingFiles ? "dragging" : ""}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={(event) => {
        void onDrop(event);
      }}
    >
      <div className="library-header">
        <div className="library-heading">
          <h1>{title}</h1>
          <p>{description}</p>
          {unresolvedWarningMessage ? <span className="auth-setup-help error">{unresolvedWarningMessage}</span> : null}
        </div>

        <LibraryToolbar
          galleryDisplayMode={galleryDisplayMode}
          thumbnailZoomIndex={thumbnailZoomIndex}
          thumbnailZoomLevelCount={thumbnailZoomLevelCount}
          thumbnailZoomPercent={thumbnailZoomPercent}
          thumbnailZoomProgress={thumbnailZoomProgress}
          bulkActions={bulkActions}
          onThumbnailZoomIndexChange={onThumbnailZoomIndexChange}
          onToggleGalleryDisplayMode={() => {
            setGalleryDisplayMode((current) => (current === "free" ? "square" : "free"));
          }}
          onRequestUpload={onRequestUpload}
        />
      </div>

      <GalleryGrid
        items={displayItems}
        isBusy={isBusy}
        displayMode={galleryDisplayMode}
        thumbnailSize={thumbnailSize}
        selectedItemIds={selectedItemIds}
        onSelectItem={onSelectItem}
        onOpenItem={handleOpenViewer}
        onClearSelection={onClearSelection}
        onApplySelectionRect={onApplySelectionRect}
        onRequestUpload={onRequestUpload}
        renderItemActions={renderThumbnailActions}
      />

      {isDraggingFiles ? (
        <div className="drop-overlay">
          <span className="drop-overlay-title">Drop files here</span>
          <span className="drop-overlay-copy">They will be added to the current view.</span>
        </div>
      ) : null}

      <MediaViewerModal
        item={activeViewerItem}
        currentIndex={activeViewerIndex}
        totalItems={displayItems.length}
        wheelBehavior={viewerWheelBehavior}
        draftState={viewerDraftState}
        hasPendingSave={viewerHasPendingSave}
        isSaving={isSavingViewerEdit}
        saveError={viewerSaveError}
        saveNotice={viewerSaveNotice}
        onDraftStateChange={setViewerDraftState}
        onSave={() => {
          void handleSaveViewerEdit();
        }}
        onRestoreOriginal={() => {
          void handleRestoreViewerOriginal();
        }}
        onClose={handleCloseViewer}
        onPrevious={() => {
          handleNavigateViewer("previous");
        }}
        onNext={() => {
          handleNavigateViewer("next");
        }}
      />
    </main>
  );
}

type MediaViewerModalProps = {
  item: LibraryItem | null;
  currentIndex: number;
  totalItems: number;
  wheelBehavior: MouseWheelBehavior;
  draftState: ViewerDraftState;
  hasPendingSave: boolean;
  isSaving: boolean;
  saveError: string;
  saveNotice: string;
  onDraftStateChange: (nextState: ViewerDraftState) => void;
  onSave: () => void;
  onRestoreOriginal: () => void;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

function clampZoom(value: number): number {
  return Math.min(5, Math.max(1, Number(value.toFixed(2))));
}

function normalizeDraftState(nextState: Omit<ViewerDraftState, "canUndo">): ViewerDraftState {
  const zoomLevel = clampZoom(nextState.zoomLevel);
  const rotationDegrees = nextState.rotationDegrees;
  const hasCrop = nextState.hasCrop;

  return {
    zoomLevel,
    rotationDegrees,
    hasCrop,
    canUndo: zoomLevel !== 1 || rotationDegrees !== 0 || hasCrop,
  };
}

const savedAtFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatSavedAt(savedAt: string | undefined): string {
  if (!savedAt) {
    return "";
  }

  const parsed = new Date(savedAt);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return savedAtFormatter.format(parsed);
}

export function MediaViewerModal({
  item,
  currentIndex,
  totalItems,
  wheelBehavior,
  draftState,
  hasPendingSave,
  isSaving,
  saveError,
  saveNotice,
  onDraftStateChange,
  onSave,
  onRestoreOriginal,
  onClose,
  onPrevious,
  onNext,
}: MediaViewerModalProps) {
  const lastWheelNavigationAtRef = useRef(0);
  const isOpen = Boolean(item);
  const imageMode = item ? isImage(item) : false;
  const videoMode = item ? isVideo(item) : false;
  const hasSavedEdit = Boolean(item?.savedMediaEdit);
  const hasOriginalSource = Boolean(item?.originalSource);
  const savedAtLabel = formatSavedAt(item?.savedMediaEdit?.savedAt);

  function updateDraftState(patch: Partial<Omit<ViewerDraftState, "canUndo">>): void {
    onDraftStateChange(
      normalizeDraftState({
        zoomLevel: patch.zoomLevel ?? draftState.zoomLevel,
        rotationDegrees: patch.rotationDegrees ?? draftState.rotationDegrees,
        hasCrop: patch.hasCrop ?? draftState.hasCrop,
      }),
    );
  }

  function zoomOut(): void {
    updateDraftState({ zoomLevel: draftState.zoomLevel - 0.2 });
  }

  function zoomIn(): void {
    updateDraftState({ zoomLevel: draftState.zoomLevel + 0.2 });
  }

  function rotateLeft(): void {
    updateDraftState({ rotationDegrees: draftState.rotationDegrees - 90 });
  }

  function rotateRight(): void {
    updateDraftState({ rotationDegrees: draftState.rotationDegrees + 90 });
  }

  function toggleCrop(): void {
    updateDraftState({ hasCrop: !draftState.hasCrop });
  }

  function resetDraftState(): void {
    onDraftStateChange(
      normalizeDraftState({
        zoomLevel: 1,
        rotationDegrees: item?.savedMediaEdit?.rotationDegrees ?? 0,
        hasCrop: item?.savedMediaEdit?.hasCrop ?? false,
      }),
    );
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPrevious();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
        return;
      }

      if (!imageMode) {
        return;
      }

      const normalizedKey = event.key.toLowerCase();

      if (normalizedKey === "+" || normalizedKey === "=") {
        event.preventDefault();
        zoomIn();
        return;
      }

      if (normalizedKey === "-" || normalizedKey === "_") {
        event.preventDefault();
        zoomOut();
        return;
      }

      if (normalizedKey === "q") {
        event.preventDefault();
        rotateLeft();
        return;
      }

      if (normalizedKey === "e") {
        event.preventDefault();
        rotateRight();
        return;
      }

      if (normalizedKey === "c") {
        event.preventDefault();
        toggleCrop();
        return;
      }

      if (normalizedKey === "0") {
        event.preventDefault();
        resetDraftState();
        return;
      }

      if (normalizedKey === "s" && hasPendingSave && !isSaving) {
        event.preventDefault();
        onSave();
        return;
      }

      if (normalizedKey === "o" && hasSavedEdit && !isSaving) {
        event.preventDefault();
        onRestoreOriginal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    draftState.hasCrop,
    draftState.rotationDegrees,
    draftState.zoomLevel,
    hasPendingSave,
    hasSavedEdit,
    imageMode,
    isOpen,
    isSaving,
    onClose,
    onNext,
    onPrevious,
    onRestoreOriginal,
    onSave,
  ]);

  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < totalItems - 1;

  const mediaTransform = useMemo(
    () => `translate(-50%, -50%) scale(${draftState.zoomLevel}) rotate(${draftState.rotationDegrees}deg)`,
    [draftState.rotationDegrees, draftState.zoomLevel],
  );

  function handleWheel(event: WheelEvent<HTMLDivElement>): void {
    if (!imageMode) {
      return;
    }

    event.preventDefault();

    if (wheelBehavior === "navigate") {
      const now = Date.now();
      if (now - lastWheelNavigationAtRef.current < 240) {
        return;
      }

      lastWheelNavigationAtRef.current = now;
      if (event.deltaY < 0) {
        onPrevious();
      } else {
        onNext();
      }
      return;
    }

    const direction = event.deltaY < 0 ? 0.14 : -0.14;
    updateDraftState({ zoomLevel: draftState.zoomLevel + direction });
  }

  if (!item) {
    return null;
  }

  return (
    <div className="media-viewer-root" role="dialog" aria-modal="true" aria-label={`Viewer for ${item.name}`}>
      <button type="button" className="media-viewer-backdrop" aria-label="Close viewer" onClick={onClose} />

      <div className="media-viewer-modal">
        <header className="media-viewer-header">
          <div className="media-viewer-heading">
            <strong className="media-viewer-title">{item.name}</strong>
            <div className="media-viewer-heading-meta">
              <span className="media-viewer-counter">
                {currentIndex + 1} / {totalItems}
              </span>
              {hasSavedEdit ? <span className="media-viewer-edit-chip">Edited</span> : null}
              {hasOriginalSource ? <span className="media-viewer-original-chip">Original preserved</span> : null}
              {savedAtLabel ? <span className="media-viewer-saved-at">Saved {savedAtLabel}</span> : null}
            </div>
          </div>

          <div className="media-viewer-header-actions">
            <button type="button" className="media-viewer-icon-button" onClick={onClose} title="Close" aria-label="Close">
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="media-viewer-stage">
          <button
            type="button"
            className="media-viewer-nav-button left"
            onClick={onPrevious}
            disabled={!canGoPrevious}
            aria-label="Previous item"
            title="Previous item"
          >
            <ArrowLeftIcon />
          </button>

          <div
            className={`media-viewer-viewport ${imageMode ? "image-mode" : ""} ${videoMode ? "video-mode" : ""} ${draftState.hasCrop ? "crop-active" : ""}`}
            onWheel={handleWheel}
          >
            {imageMode ? (
              <img
                src={item.attachmentUrl}
                alt={item.name}
                className="media-viewer-image"
                draggable={false}
                style={{
                  transform: mediaTransform,
                  objectFit: draftState.hasCrop ? "cover" : "contain",
                }}
              />
            ) : null}

            {videoMode ? (
              <video
                src={item.attachmentUrl}
                className="media-viewer-video"
                controls
                playsInline
                preload="metadata"
              />
            ) : null}

            {!imageMode && !videoMode ? (
              <div className="media-viewer-file-fallback">
                <span className="media-viewer-file-extension">
                  {(item.name.split(".").pop() || "FILE").slice(0, 5).toUpperCase()}
                </span>
                <span className="media-viewer-file-name">{item.name}</span>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="media-viewer-nav-button right"
            onClick={onNext}
            disabled={!canGoNext}
            aria-label="Next item"
            title="Next item"
          >
            <ArrowRightIcon />
          </button>
        </div>

        <footer className="media-viewer-toolbar">
          {imageMode ? (
            <div className="media-viewer-control-group">
              <button
                type="button"
                className="media-viewer-control-button"
                onClick={zoomOut}
                disabled={draftState.zoomLevel <= 1}
                title="Zoom out"
              >
                <span className="media-viewer-control-icon"><ZoomOutIcon /></span>
                <span className="media-viewer-control-label">Zoom out</span>
              </button>

              <button
                type="button"
                className="media-viewer-control-button"
                onClick={zoomIn}
                disabled={draftState.zoomLevel >= 5}
                title="Zoom in"
              >
                <span className="media-viewer-control-icon"><ZoomInIcon /></span>
                <span className="media-viewer-control-label">Zoom in</span>
              </button>

              <button
                type="button"
                className="media-viewer-control-button"
                onClick={rotateLeft}
                title="Rotate left"
              >
                <span className="media-viewer-control-icon"><RotateLeftIcon /></span>
                <span className="media-viewer-control-label">Rotate left</span>
              </button>

              <button
                type="button"
                className="media-viewer-control-button"
                onClick={rotateRight}
                title="Rotate right"
              >
                <span className="media-viewer-control-icon"><RotateRightIcon /></span>
                <span className="media-viewer-control-label">Rotate right</span>
              </button>

              <button
                type="button"
                className={`media-viewer-control-button ${draftState.hasCrop ? "active" : ""}`}
                onClick={toggleCrop}
                title={draftState.hasCrop ? "Disable crop preview" : "Enable crop preview"}
              >
                <span className="media-viewer-control-icon"><CropIcon /></span>
                <span className="media-viewer-control-label">Crop</span>
              </button>

              <button
                type="button"
                className="media-viewer-control-button"
                onClick={resetDraftState}
                disabled={!draftState.canUndo}
                title="Undo local edits"
              >
                <span className="media-viewer-control-icon"><UndoIcon /></span>
                <span className="media-viewer-control-label">Undo</span>
              </button>

              <button
                type="button"
                className={`media-viewer-control-button restore-original-button ${hasSavedEdit ? "active" : ""}`}
                onClick={onRestoreOriginal}
                disabled={!hasSavedEdit || isSaving}
                title={hasSavedEdit ? "Restore the original saved image" : "No saved image edit to restore"}
              >
                <span className="media-viewer-control-icon"><RestoreOriginalIcon /></span>
                <span className="media-viewer-control-label">Original</span>
              </button>

              <button
                type="button"
                className={`media-viewer-control-button save-button ${hasPendingSave ? "active" : ""}`}
                onClick={onSave}
                disabled={!hasPendingSave || isSaving}
                title={hasPendingSave ? "Save image edits" : "No unsaved image edits"}
              >
                <span className="media-viewer-control-icon"><SaveIcon /></span>
                <span className="media-viewer-control-label">{isSaving ? "Saving..." : "Save"}</span>
              </button>
            </div>
          ) : (
            <div className="media-viewer-info-chip">
              {videoMode ? "Video preview" : "File preview"}
            </div>
          )}

          <div className="media-viewer-footer-meta">
            {saveError ? <span className="media-viewer-save-status error">{saveError}</span> : null}
            {!saveError && saveNotice ? <span className="media-viewer-save-status success">{saveNotice}</span> : null}
            <div className="media-viewer-shortcuts-hint">
              <span>Esc Close</span>
              <span>←/→ Navigate</span>
              {imageMode ? <span>Q/E Rotate</span> : null}
              {imageMode ? <span>C Crop</span> : null}
              {imageMode ? <span>S Save</span> : null}
              {hasSavedEdit ? <span>O Original</span> : null}
            </div>
            <div className="media-viewer-zoom-readout" aria-live="polite">
              {imageMode ? `${Math.round(draftState.zoomLevel * 100)}% • Wheel: ${wheelBehavior === "zoom" ? "Zoom" : "Navigate"}` : "Preview"}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

type SettingsModalProps = {
  profile: {
    nickname: string;
    server: string;
    avatarUrl: string | null;
  };
  settingsSection: SettingsSection;
  sessionName: string | null;
  activeGuildName: string | null;
  minimizeToTray: boolean;
  closeToTray: boolean;
  accentColor: string;
  onClose: () => void;
  onSelectSection: (section: SettingsSection) => void;
  onChangeMinimizeToTray: (checked: boolean) => void;
  onChangeCloseToTray: (checked: boolean) => void;
  onCommitAccentColor: (value: string) => void;
};

const settingsSections: Array<{ id: SettingsSection; label: string }> = [
  { id: "discord", label: "Discord" },
  { id: "appearance", label: "Appearance" },
  { id: "window", label: "Window" },
];

type AccentColorPickerProps = {
  color: string;
  onCommitHex: (nextHex: string) => void;
};

function AccentColorPicker({ color, onCommitHex }: AccentColorPickerProps) {
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
  const helperText = draftError || "Click the swatch to open the picker.";

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

      <span className={`settings-input-help ${draftError ? "error" : ""}`}>{helperText}</span>
    </div>
  );
}

export function SettingsModal({
  profile,
  settingsSection,
  sessionName,
  activeGuildName,
  minimizeToTray,
  closeToTray,
  accentColor,
  onClose,
  onSelectSection,
  onChangeMinimizeToTray,
  onChangeCloseToTray,
  onCommitAccentColor,
}: SettingsModalProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [mouseWheelBehavior, setMouseWheelBehavior] = useState(() => readStoredMouseWheelBehavior());

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

  function handleChangeMouseWheelBehavior(nextValue: "zoom" | "navigate"): void {
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
            <AccentColorPicker color={accentColor} onCommitHex={onCommitAccentColor} />
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
              onChange={(event) => handleChangeMouseWheelBehavior(event.currentTarget.value as "zoom" | "navigate")}
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

const libraryEntries = [
  { id: "all-files", label: "All Files", icon: LibraryIcon },
  { id: "favorites", label: "Favorites", icon: HeartIcon },
  { id: "trash", label: "Trash", icon: TrashIcon },
] as const;

const collectionEntries = [
  { id: "pictures", label: "Pictures", icon: PictureIcon },
  { id: "videos", label: "Videos", icon: VideoIcon },
  { id: "others", label: "Others", icon: FolderIcon },
] as const;

type SidebarProps = {
  albums: AlbumRecord[];
  selectedView: SidebarView;
  isSidebarCollapsed: boolean;
  profile: {
    nickname: string;
    server: string;
    avatarUrl: string | null;
  };
  onToggleSidebar: () => void;
  onOpenView: (view: SidebarView) => void;
  onOpenCreateAlbum: () => void;
  onOpenAlbumContextMenu: (event: ReactMouseEvent<HTMLElement>, albumId: string, albumName: string) => void;
};

export function Sidebar({
  albums,
  selectedView,
  isSidebarCollapsed,
  profile,
  onToggleSidebar,
  onOpenView,
  onOpenCreateAlbum,
  onOpenAlbumContextMenu,
}: SidebarProps) {
  return (
    <aside className={`sidebar-panel panel-surface ${isSidebarCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-topbar">
        <button
          type="button"
          className="icon-circle-button sidebar-toggle-button"
          onClick={onToggleSidebar}
          aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isSidebarCollapsed ? <ChevronRightDoubleIcon /> : <ChevronLeftDoubleIcon />}
        </button>
      </div>

      <div className="sidebar-scroll scrollable-y subtle-scrollbar sidebar-scrollbar-host">
        <section className="sidebar-section">
          {!isSidebarCollapsed ? <h2 className="sidebar-section-title">Library</h2> : null}

          {libraryEntries.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`sidebar-item ${selectedView.kind === "library" && selectedView.id === id ? "selected" : ""}`}
              onClick={() => onOpenView({ kind: "library", id })}
              title={label}
            >
              <span className="sidebar-item-icon"><Icon /></span>
              {!isSidebarCollapsed ? <span className="sidebar-item-label">{label}</span> : null}
            </button>
          ))}
        </section>

        <section className="sidebar-section">
          {!isSidebarCollapsed ? <h2 className="sidebar-section-title">Collections</h2> : null}

          {collectionEntries.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`sidebar-item ${selectedView.kind === "collection" && selectedView.id === id ? "selected" : ""}`}
              onClick={() => onOpenView({ kind: "collection", id })}
              title={label}
            >
              <span className="sidebar-item-icon"><Icon /></span>
              {!isSidebarCollapsed ? <span className="sidebar-item-label">{label}</span> : null}
            </button>
          ))}
        </section>

        <section className="sidebar-section">
          {!isSidebarCollapsed ? <h2 className="sidebar-section-title">Albums</h2> : null}

          {albums.map((album) => (
            <button
              key={album.id}
              type="button"
              className={`sidebar-item ${selectedView.kind === "album" && selectedView.id === album.id ? "selected" : ""}`}
              onClick={() => onOpenView({ kind: "album", id: album.id })}
              onContextMenu={(event) => onOpenAlbumContextMenu(event, album.id, album.name)}
              title={album.name}
            >
              <span className="sidebar-item-icon"><FolderIcon /></span>
              {!isSidebarCollapsed ? <span className="sidebar-item-label">{album.name}</span> : null}
            </button>
          ))}

          {!isSidebarCollapsed ? (
            <button
              type="button"
              className="sidebar-item"
              onClick={onOpenCreateAlbum}
              title="Create album"
            >
              <span className="sidebar-item-icon"><PlusIcon /></span>
              <span className="sidebar-item-label">Create album</span>
            </button>
          ) : null}
        </section>
      </div>

      <footer className="sidebar-profile">
        <ProfileAvatar avatarUrl={profile.avatarUrl} className="profile-avatar" />
        {!isSidebarCollapsed ? (
          <div className="profile-copy">
            <span className="profile-primary">{profile.nickname}</span>
            <span className="profile-secondary">{profile.server}</span>
          </div>
        ) : null}
      </footer>
    </aside>
  );
}

type StatusToastProps = {
  message: string;
  error: string;
};

export function StatusToast({ message, error }: StatusToastProps) {
  if (!message && !error) return null;

  return (
    <div className="status-toast">
      {message ? <span>{message}</span> : null}
      {error ? <span className="status-error">{error}</span> : null}
    </div>
  );
}

type TitlebarProps = {
  logoUrl: string;
  windowState: WindowState;
  onDragStart: (event: ReactMouseEvent<HTMLElement>) => Promise<void>;
  onOpenSettings: () => void;
  onMinimize: () => Promise<void>;
  onToggleMaximize: () => Promise<void>;
  onClose: () => Promise<void>;
};

export function Titlebar({
  logoUrl,
  windowState,
  onDragStart,
  onOpenSettings,
  onMinimize,
  onToggleMaximize,
  onClose,
}: TitlebarProps) {
  function handleTitlebarMouseDown(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;

    if (target?.closest("[data-window-control='true']")) {
      return;
    }

    void onDragStart(event);
  }

  return (
    <header className="titlebar" onMouseDown={handleTitlebarMouseDown}>
      <div className="titlebar-drag-region" aria-hidden="true">
        <div className="brand">
          <img src={logoUrl} alt="Discasa" className="brand-logo" />
          <span className="brand-name">Discasa</span>
        </div>
      </div>

      <div className="window-controls">
        <button
          type="button"
          className="icon-circle-button window-button"
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Open settings"
          data-window-control="true"
        >
          <span className="window-glyph icon-glyph">
            <SettingsIcon />
          </span>
        </button>
        <button
          type="button"
          className="icon-circle-button window-button"
          onClick={() => void onMinimize()}
          aria-label="Minimize"
          data-window-control="true"
        >
          <span className="window-glyph minimize" />
        </button>
        <button
          type="button"
          className="icon-circle-button window-button"
          onClick={() => void onToggleMaximize()}
          aria-label={windowState === "maximized" ? "Restore window" : "Maximize window"}
          data-window-control="true"
        >
          <span className="window-glyph maximize" />
        </button>
        <button
          type="button"
          className="icon-circle-button window-button close-button"
          onClick={() => void onClose()}
          aria-label="Close"
          data-window-control="true"
        >
          <span className="window-glyph close" />
        </button>
      </div>
    </header>
  );
}

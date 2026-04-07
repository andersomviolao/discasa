import type { ChangeEvent } from "react";
import { DISCASA_CHANNELS, type GuildSummary } from "@discasa/shared";
import { BaseModal } from "./BaseModal";

export type AuthSetupStep = "login" | "waiting" | "select-server" | "invite-bot" | "apply-server";

type AuthSetupModalProps = {
  step: AuthSetupStep;
  guilds: GuildSummary[];
  selectedGuildId: string;
  selectedGuildName: string | null;
  error: string;
  isLoadingGuilds: boolean;
  isApplyingGuild: boolean;
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
            Pick one of the Discord servers where you own the server or have permission to manage it. Discasa will use this
            server to create the channels that store your files and metadata.
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
            disabled={isLoadingGuilds || !hasGuilds}
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
          <button type="button" className="pill-button secondary-button" onClick={onRetryGuilds}>
            Refresh list
          </button>
          <button
            type="button"
            className="pill-button accent-button primary-button"
            onClick={onConfirmGuild}
            disabled={!selectedGuildId}
          >
            OK
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
            authorization, return here and continue to the storage setup step.
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
            disabled={!selectedGuildId || !hasOpenedBotInvite}
          >
            Continue
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

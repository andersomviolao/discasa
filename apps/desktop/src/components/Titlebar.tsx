import type { MouseEvent } from "react";
import { SettingsIcon } from "./icons";
import type { WindowState } from "../ui-types";

type TitlebarProps = {
  logoUrl: string;
  windowState: WindowState;
  onDragStart: (event: MouseEvent<HTMLElement>) => Promise<void>;
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
  return (
    <header className="titlebar">
      <div
        className="titlebar-drag-region"
        aria-hidden="true"
        onMouseDown={(event) => {
          void onDragStart(event);
        }}
      >
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
        >
          <span className="window-glyph icon-glyph">
            <SettingsIcon />
          </span>
        </button>
        <button type="button" className="icon-circle-button window-button" onClick={() => void onMinimize()} aria-label="Minimize">
          <span className="window-glyph minimize" />
        </button>
        <button
          type="button"
          className="icon-circle-button window-button"
          onClick={() => void onToggleMaximize()}
          aria-label={windowState === "maximized" ? "Restore window" : "Maximize window"}
        >
          <span className="window-glyph maximize" />
        </button>
        <button type="button" className="icon-circle-button window-button close-button" onClick={() => void onClose()} aria-label="Close">
          <span className="window-glyph close" />
        </button>
      </div>
    </header>
  );
}

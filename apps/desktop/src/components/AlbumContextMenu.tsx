import type { PointerEventHandler } from "react";
import type { AlbumContextMenuState } from "../ui-types";

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

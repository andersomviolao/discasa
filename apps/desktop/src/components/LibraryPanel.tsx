import type { DragEvent } from "react";
import type { LibraryItem } from "@discasa/shared";
import { getFileTypeLabel } from "../lib/library-helpers";
import { UploadIcon } from "./icons";

type LibraryPanelProps = {
  title: string;
  description: string;
  items: LibraryItem[];
  isBusy: boolean;
  isDraggingFiles: boolean;
  onRequestUpload: () => void;
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => Promise<void>;
  onToggleFavorite: (itemId: string) => Promise<void>;
  onMoveToTrash: (itemId: string) => Promise<void>;
  onRestoreFromTrash: (itemId: string) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
};

const bytesFormatter = new Intl.NumberFormat("en-US");

export function LibraryPanel({
  title,
  description,
  items,
  isBusy,
  isDraggingFiles,
  onRequestUpload,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onToggleFavorite,
  onMoveToTrash,
  onRestoreFromTrash,
  onDeleteItem,
}: LibraryPanelProps) {
  function renderCardActions(item: LibraryItem) {
    if (item.isTrashed) {
      return (
        <div className="file-actions">
          <button type="button" className="pill-button file-action-button" onClick={() => void onRestoreFromTrash(item.id)}>
            Restore
          </button>
          <button type="button" className="pill-button file-action-button danger" onClick={() => void onDeleteItem(item.id)}>
            Delete
          </button>
        </div>
      );
    }

    return (
      <div className="file-actions">
        <button
          type="button"
          className={`pill-button file-action-button ${item.isFavorite ? "active" : ""}`}
          onClick={() => void onToggleFavorite(item.id)}
        >
          {item.isFavorite ? "Unfavorite" : "Favorite"}
        </button>
        <button type="button" className="pill-button file-action-button" onClick={() => void onMoveToTrash(item.id)}>
          Trash
        </button>
      </div>
    );
  }

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
        </div>

        <button type="button" className="icon-circle-button upload-button" onClick={onRequestUpload} aria-label="Upload" title="Upload">
          <UploadIcon />
        </button>
      </div>

      <div className="files-grid scrollable-y subtle-scrollbar content-scrollbar-host">
        {items.map((item) => (
          <article key={item.id} className="file-card" title={item.name}>
            <div className="file-preview">
              <span className="file-type-chip">{getFileTypeLabel(item)}</span>
            </div>
            <div className="file-meta">
              <span className="file-name">{item.name}</span>
              <small className="file-size">{bytesFormatter.format(item.size)} bytes</small>
              {renderCardActions(item)}
            </div>
          </article>
        ))}

        {items.length === 0 && !isBusy ? (
          <button type="button" className="empty-state" onClick={onRequestUpload}>
            <span className="empty-state-title">No files yet.</span>
            <span className="empty-state-copy">Drag files from Explorer into this area or click to upload.</span>
          </button>
        ) : null}
      </div>

      {isDraggingFiles ? (
        <div className="drop-overlay">
          <span className="drop-overlay-title">Drop files here</span>
          <span className="drop-overlay-copy">They will be added to the current view.</span>
        </div>
      ) : null}
    </main>
  );
}

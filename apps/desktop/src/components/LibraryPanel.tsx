import { useMemo, useState, type CSSProperties, type DragEvent } from "react";
import type { LibraryItem } from "@discasa/shared";
import { getFileTypeLabel, isImage, isVideo } from "../lib/library-helpers";
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

const previewLayerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
};

const previewMediaStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "block",
  objectFit: "cover",
  background: "rgba(3, 10, 22, 0.88)",
};

const previewShadeStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  background: "linear-gradient(180deg, rgba(5, 10, 18, 0.16) 0%, rgba(5, 10, 18, 0.02) 38%, rgba(5, 10, 18, 0.48) 100%)",
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
  background: "radial-gradient(circle at top, rgba(233, 136, 29, 0.18) 0%, rgba(8, 14, 24, 0.88) 44%, rgba(4, 8, 15, 0.98) 100%)",
};

const previewExtensionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "74px",
  minHeight: "74px",
  padding: "12px",
  borderRadius: "18px",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  background: "rgba(255, 255, 255, 0.08)",
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
  color: "rgba(255, 255, 255, 0.64)",
  fontSize: "11px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const previewVideoBadgeStyle: CSSProperties = {
  position: "absolute",
  right: "12px",
  bottom: "12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "24px",
  padding: "0 10px",
  borderRadius: "999px",
  background: "rgba(8, 14, 24, 0.82)",
  color: "rgba(255, 255, 255, 0.88)",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.08em",
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

function FileThumbnail({ item }: { item: LibraryItem }) {
  const [hasPreviewError, setHasPreviewError] = useState(false);

  const extension = useMemo(() => getFileExtension(item.name), [item.name]);
  const fallbackLabel = useMemo(() => getFallbackLabel(item), [item]);
  const canRenderImage = isImage(item) && !hasPreviewError;
  const canRenderVideo = isVideo(item) && !hasPreviewError;

  return (
    <div className="file-preview">
      {canRenderImage ? (
        <>
          <img
            src={item.attachmentUrl}
            alt={item.name}
            loading="lazy"
            draggable={false}
            style={previewMediaStyle}
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
            style={previewMediaStyle}
            onError={() => setHasPreviewError(true)}
          />
          <div aria-hidden="true" style={previewShadeStyle} />
          <span aria-hidden="true" style={previewVideoBadgeStyle}>
            PREVIEW
          </span>
        </>
      ) : null}

      {!canRenderImage && !canRenderVideo ? (
        <div aria-hidden="true" style={previewFallbackStyle}>
          <span style={previewExtensionStyle}>{extension}</span>
          <span style={previewCaptionStyle}>{fallbackLabel}</span>
        </div>
      ) : null}

      <div aria-hidden="true" style={previewLayerStyle}>
        <span className="file-type-chip">{getFileTypeLabel(item)}</span>
      </div>
    </div>
  );
}

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
            <FileThumbnail item={item} />
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

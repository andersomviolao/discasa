import { useMemo, useState, type CSSProperties, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import type { LibraryItem } from "@discasa/shared";
import { getFileTypeLabel, isImage, isVideo } from "../lib/library-helpers";
import { UploadIcon } from "./icons";

type LibraryPanelProps = {
  title: string;
  description: string;
  items: LibraryItem[];
  isBusy: boolean;
  isDraggingFiles: boolean;
  thumbnailSize: number;
  thumbnailZoomIndex: number;
  thumbnailZoomLevelCount: number;
  thumbnailZoomPercent: number;
  onThumbnailZoomIndexChange: (nextIndex: number) => void;
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

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 20.7 4.85 13.9a4.95 4.95 0 0 1 0-7.15 5.15 5.15 0 0 1 7.15 0L12 7.75l1-1a5.15 5.15 0 0 1 7.15 0 4.95 4.95 0 0 1 0 7.15Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 7h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 4h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 7v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v5M14 11v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 10H4V5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.6 10A8 8 0 1 0 12 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

function FileThumbnail({ item, actions }: { item: LibraryItem; actions: ReactNode }) {
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
            Preview
          </span>
        </>
      ) : null}

      {!canRenderImage && !canRenderVideo ? (
        <div aria-hidden="true" style={previewFallbackStyle}>
          <span style={previewExtensionStyle}>{extension}</span>
          <span style={previewCaptionStyle}>{fallbackLabel}</span>
        </div>
      ) : null}

      <span className="file-type-chip">{getFileTypeLabel(item)}</span>
      <div className="file-preview-actions">{actions}</div>
    </div>
  );
}

export function LibraryPanel({
  title,
  description,
  items,
  isBusy,
  isDraggingFiles,
  thumbnailSize,
  thumbnailZoomIndex,
  thumbnailZoomLevelCount,
  thumbnailZoomPercent,
  onThumbnailZoomIndexChange,
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
  function handleThumbnailZoomChange(event: ChangeEvent<HTMLInputElement>): void {
    onThumbnailZoomIndexChange(Number(event.currentTarget.value));
  }

  function renderThumbnailActions(item: LibraryItem) {
    if (item.isTrashed) {
      return (
        <>
          <button
            type="button"
            className="file-icon-button"
            onClick={() => void onRestoreFromTrash(item.id)}
            aria-label="Restore"
            title="Restore"
          >
            <RestoreIcon />
          </button>
          <button
            type="button"
            className="file-icon-button danger"
            onClick={() => void onDeleteItem(item.id)}
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
          onClick={() => void onToggleFavorite(item.id)}
          aria-label={item.isFavorite ? "Unfavorite" : "Favorite"}
          title={item.isFavorite ? "Unfavorite" : "Favorite"}
        >
          <HeartIcon filled={item.isFavorite} />
        </button>
        <button
          type="button"
          className="file-icon-button danger"
          onClick={() => void onMoveToTrash(item.id)}
          aria-label="Trash"
          title="Trash"
        >
          <TrashIcon />
        </button>
      </>
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

        <div className="library-tools">
          <label className="thumbnail-zoom-control" title="Thumbnail zoom">
            <span className="thumbnail-zoom-label">Zoom</span>
            <input
              className="thumbnail-zoom-slider"
              type="range"
              min={0}
              max={thumbnailZoomLevelCount - 1}
              step={1}
              value={thumbnailZoomIndex}
              onChange={handleThumbnailZoomChange}
              aria-label="Thumbnail zoom"
            />
            <span className="thumbnail-zoom-value">{thumbnailZoomPercent}%</span>
          </label>

          <button type="button" className="icon-circle-button upload-button" onClick={onRequestUpload} aria-label="Upload" title="Upload">
            <UploadIcon />
          </button>
        </div>
      </div>

      <div
        className="files-grid scrollable-y subtle-scrollbar content-scrollbar-host"
        style={{ "--file-card-width": `${thumbnailSize}px` } as CSSProperties}
      >
        {items.map((item) => (
          <article key={item.id} className="file-card" title={item.name}>
            <FileThumbnail item={item} actions={renderThumbnailActions(item)} />
            <div className="file-meta">
              <span className="file-name">{item.name}</span>
              <small className="file-size">{bytesFormatter.format(item.size)} bytes</small>
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

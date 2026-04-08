import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { LibraryItem } from "@discasa/shared";
import { getPersistedMediaPresentation } from "../lib/media-edits";
import type { GalleryDisplayMode } from "../ui-types";
import { isImage, isVideo } from "../lib/library-helpers";

type GalleryItemProps = {
  item: LibraryItem;
  isSelected: boolean;
  displayMode: GalleryDisplayMode;
  actions: ReactNode;
  onClick: (event: ReactMouseEvent<HTMLElement>, itemId: string) => void;
  onDoubleClick: (itemId: string) => void;
  onRegisterElement: (itemId: string, element: HTMLElement | null) => void;
};

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

const bytesFormatter = new Intl.NumberFormat("en-US");

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

function stopActionEvent(event: ReactMouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>): void {
  event.stopPropagation();
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
      : mediaAspectRatio ?? resolveFallbackAspectRatio(item);

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

export function GalleryItem({ item, isSelected, displayMode, actions, onClick, onDoubleClick, onRegisterElement }: GalleryItemProps) {
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

export { stopActionEvent };

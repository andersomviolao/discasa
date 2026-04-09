import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type {
  DiscasaAttachmentRecoveryWarning,
  LibraryItem,
  SaveLibraryItemMediaEditInput,
} from "@discasa/shared";
import {
  createViewerDraftStateFromItem,
  getPersistedMediaPresentation,
  hasPendingViewerSave,
  toMediaEditSaveInput,
} from "../lib/media-edits";
import { isImage, isVideo } from "../lib/library-helpers";
import { readStoredMouseWheelBehavior, VIEWER_WHEEL_BEHAVIOR_EVENT } from "../lib/ui-preferences";
import type { GalleryDisplayMode, MouseWheelBehavior, ViewerDraftState, ViewerState } from "../ui-types";
import { BulkActionBar } from "./BulkActionBar";
import { GalleryModeIcon, HeartIcon, RestoreIcon, TrashIcon, UploadIcon, ZoomIcon } from "./Icons";
import { MediaViewerModal } from "./MediaViewerModal";

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

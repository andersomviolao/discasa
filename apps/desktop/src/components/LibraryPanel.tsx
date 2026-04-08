import { useEffect, useMemo, useState, type DragEvent } from "react";
import type { LibraryItem } from "@discasa/shared";
import { restoreLibraryItemOriginal, saveLibraryItemMediaEdit } from "../lib/api";
import {
  createViewerDraftStateFromItem,
  hasPendingViewerSave,
  toMediaEditSaveInput,
} from "../lib/media-edits";
import type { GalleryDisplayMode, MouseWheelBehavior, ViewerDraftState, ViewerState } from "../ui-types";
import "../gallery-stage2.css";
import { BulkActionBar } from "./BulkActionBar";
import { LibraryToolbar } from "./LibraryToolbar";
import { GalleryGrid } from "./GalleryGrid";
import { MediaViewerModal } from "./MediaViewerModal";
import { stopActionEvent } from "./GalleryItem";

type LibraryPanelProps = {
  title: string;
  description: string;
  items: LibraryItem[];
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
  onDeleteItem: (itemId: string) => Promise<void>;
};

const VIEWER_MOUSE_WHEEL_BEHAVIOR_KEY = "discasa.viewer.mouseWheelBehavior";
const VIEWER_WHEEL_BEHAVIOR_EVENT = "discasa:viewer-wheel-behavior";

function readStoredMouseWheelBehavior(): MouseWheelBehavior {
  if (typeof window === "undefined") {
    return "zoom";
  }

  const raw = window.localStorage.getItem(VIEWER_MOUSE_WHEEL_BEHAVIOR_KEY);
  return raw === "navigate" ? "navigate" : "zoom";
}

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

export function LibraryPanel({
  title,
  description,
  items,
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
  onDeleteItem,
}: LibraryPanelProps) {
  const [galleryDisplayMode, setGalleryDisplayMode] = useState<GalleryDisplayMode>("free");
  const [viewerState, setViewerState] = useState<ViewerState>(null);
  const [viewerWheelBehavior, setViewerWheelBehavior] = useState<MouseWheelBehavior>(() => readStoredMouseWheelBehavior());
  const [viewerDraftState, setViewerDraftState] = useState<ViewerDraftState>(() => createViewerDraftStateFromItem(null));
  const [isSavingViewerEdit, setIsSavingViewerEdit] = useState(false);
  const [viewerSaveError, setViewerSaveError] = useState("");
  const [viewerSaveNotice, setViewerSaveNotice] = useState("");
  const [itemEditOverrides, setItemEditOverrides] = useState<Record<string, Pick<LibraryItem, "savedMediaEdit" | "originalSource">>>({});

  const displayItems = useMemo(
    () =>
      items.map((item) => {
        const override = itemEditOverrides[item.id];
        return override
          ? {
              ...item,
              ...override,
            }
          : item;
      }),
    [itemEditOverrides, items],
  );

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
  const viewerHasPendingSave = hasPendingViewerSave(activeViewerItem, viewerDraftState);
  const viewerHasSavedEdit = Boolean(activeViewerItem?.savedMediaEdit);

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
  }, [activeViewerItem?.id, viewerState]);

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
      const response = await saveLibraryItemMediaEdit(activeViewerItem.id, toMediaEditSaveInput(viewerDraftState));
      setItemEditOverrides((current) => ({
        ...current,
        [activeViewerItem.id]: {
          savedMediaEdit: response.item.savedMediaEdit ?? null,
          originalSource: response.item.originalSource ?? null,
        },
      }));
      setViewerSaveNotice(response.item.savedMediaEdit ? "Edits saved for this image." : "Image restored to the original view.");
    } catch (caughtError) {
      setViewerSaveError(caughtError instanceof Error ? caughtError.message : "Could not save the image edits.");
    } finally {
      setIsSavingViewerEdit(false);
    }
  }

  async function handleRestoreViewerOriginal(): Promise<void> {
    if (!activeViewerItem || !activeViewerItem.mimeType.startsWith("image/") || isSavingViewerEdit || !viewerHasSavedEdit) {
      return;
    }

    setIsSavingViewerEdit(true);
    setViewerSaveError("");
    setViewerSaveNotice("");

    try {
      const response = await restoreLibraryItemOriginal(activeViewerItem.id);
      setItemEditOverrides((current) => ({
        ...current,
        [activeViewerItem.id]: {
          savedMediaEdit: response.item.savedMediaEdit ?? null,
          originalSource: response.item.originalSource ?? null,
        },
      }));
      setViewerDraftState(
        createViewerDraftStateFromItem({
          ...activeViewerItem,
          savedMediaEdit: null,
          originalSource: null,
        }),
      );
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
          <HeartIcon filled={item.isFavorite} />
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

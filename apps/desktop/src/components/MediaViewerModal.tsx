import { useEffect, useMemo, useRef, type WheelEvent } from "react";
import type { LibraryItem } from "@discasa/shared";
import type { MouseWheelBehavior, ViewerDraftState } from "../ui-types";
import { isImage, isVideo } from "../lib/library-helpers";

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

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m14.5 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15 15 19 19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M10.5 8.1v4.8M8.1 10.5h4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15 15 19 19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8.1 10.5h4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function RotateLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 9A7 7 0 1 1 5 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RotateRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17 5v4h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 9A7 7 0 1 0 19 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CropIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4.5v10.25A2.25 2.25 0 0 0 9.25 17H19.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 19.5V9.25A2.25 2.25 0 0 0 14.75 7H4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 7H4v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 12A7.5 7.5 0 1 1 12 19.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4.75h9.75L19.25 8v11.25H6Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 4.75v5.5h6v-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 19.25v-4.5h6v4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function RestoreOriginalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 10H4V5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.6 10A8 8 0 1 0 12 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

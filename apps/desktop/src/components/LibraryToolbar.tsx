import type { CSSProperties, ChangeEvent } from "react";
import type { GalleryDisplayMode } from "../ui-types";
import { GalleryModeIcon, UploadIcon, ZoomIcon } from "./icons";

type LibraryToolbarProps = {
  galleryDisplayMode: GalleryDisplayMode;
  thumbnailZoomIndex: number;
  thumbnailZoomLevelCount: number;
  thumbnailZoomPercent: number;
  thumbnailZoomProgress: number;
  onThumbnailZoomIndexChange: (nextIndex: number) => void;
  onToggleGalleryDisplayMode: () => void;
  onRequestUpload: () => void;
};

export function LibraryToolbar({
  galleryDisplayMode,
  thumbnailZoomIndex,
  thumbnailZoomLevelCount,
  thumbnailZoomPercent,
  thumbnailZoomProgress,
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
      <div className="library-view-controls">
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
      </div>

      <button type="button" className="icon-circle-button upload-button" onClick={onRequestUpload} aria-label="Upload" title="Upload">
        <UploadIcon />
      </button>
    </div>
  );
}

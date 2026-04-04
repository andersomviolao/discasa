import type { FormEvent, RefObject } from "react";

type AlbumModalProps = {
  isCreatingAlbum: boolean;
  newAlbumName: string;
  createAlbumError: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onChangeName: (value: string) => void;
};

export function AlbumModal({
  isCreatingAlbum,
  newAlbumName,
  createAlbumError,
  inputRef,
  onClose,
  onSubmit,
  onChangeName,
}: AlbumModalProps) {
  return (
    <div className="album-modal-root" role="dialog" aria-modal="true" aria-label="Create new album">
      <button type="button" className="album-modal-backdrop" aria-label="Close album creation" onClick={onClose} />

      <div className="album-modal">
        <button type="button" className="icon-circle-button modal-close-button album-modal-close" onClick={onClose} aria-label="Close album creation">
          <span className="modal-close-glyph">×</span>
        </button>

        <form className="album-modal-content" onSubmit={(event) => void onSubmit(event)}>
          <div className="album-modal-header">
            <h2>New album</h2>
            <p>Choose a name for the new folder in the Albums section.</p>
          </div>

          <div className="album-modal-field">
            <label className="album-modal-label" htmlFor="new-album-name">
              Album name
            </label>
            <input
              ref={inputRef}
              id="new-album-name"
              className="form-text-input album-modal-input"
              type="text"
              value={newAlbumName}
              onChange={(event) => onChangeName(event.currentTarget.value)}
              placeholder="Enter the album name"
              autoComplete="off"
              spellCheck={false}
              disabled={isCreatingAlbum}
            />
            {createAlbumError ? <span className="album-modal-error">{createAlbumError}</span> : null}
          </div>

          <div className="album-modal-actions">
            <button type="submit" className="pill-button accent-button album-modal-confirm" disabled={isCreatingAlbum}>
              {isCreatingAlbum ? "Creating..." : "OK"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

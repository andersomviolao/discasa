import { BaseModal } from "./BaseModal";

type DeleteAlbumModalProps = {
  albumName: string;
  isDeleting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function DeleteAlbumModal({
  albumName,
  isDeleting,
  error,
  onClose,
  onConfirm,
}: DeleteAlbumModalProps) {
  return (
    <BaseModal
      rootClassName="album-modal-root"
      backdropClassName="album-modal-backdrop"
      panelClassName="album-modal delete-album-modal"
      ariaLabel="Delete album confirmation"
    >
      <div className="delete-album-modal-content">
        <div className="album-modal-header delete-album-modal-header">
          <h2>Delete album</h2>
          <p>Delete the album “{albumName}”?</p>
        </div>

        <p className="delete-album-modal-copy">
          This removes the album from the sidebar, but the files stay in your library.
        </p>

        {error ? <span className="album-modal-error">{error}</span> : null}

        <div className="delete-album-modal-actions">
          <button
            type="button"
            className="pill-button secondary-button delete-album-modal-cancel"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="pill-button danger-button delete-album-modal-confirm"
            onClick={() => void onConfirm()}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}

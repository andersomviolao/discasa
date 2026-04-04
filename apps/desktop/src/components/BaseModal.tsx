import type { MouseEvent, PointerEvent, ReactNode } from "react";

type BaseModalProps = {
  rootClassName: string;
  backdropClassName: string;
  panelClassName: string;
  ariaLabel: string;
  children: ReactNode;
  showCloseButton?: boolean;
  closeButtonClassName?: string;
  closeButtonAriaLabel?: string;
  onClose?: () => void;
};

export function BaseModal({
  rootClassName,
  backdropClassName,
  panelClassName,
  ariaLabel,
  children,
  showCloseButton = false,
  closeButtonClassName = "",
  closeButtonAriaLabel = "Close modal",
  onClose,
}: BaseModalProps) {
  function handlePanelPointerDown(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
  }

  function handleCloseButtonPointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
  }

  const resolvedCloseButtonClassName = [
    "icon-circle-button",
    "modal-close-button",
    closeButtonClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div className={backdropClassName} aria-hidden="true" />

      <div className={panelClassName} onPointerDown={handlePanelPointerDown}>
        {children}

        {showCloseButton && onClose ? (
          <button
            type="button"
            className={resolvedCloseButtonClassName}
            onPointerDown={handleCloseButtonPointerDown}
            onClick={onClose}
            aria-label={closeButtonAriaLabel}
          >
            <span className="modal-close-glyph">×</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

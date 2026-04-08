import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { LibraryItem } from "@discasa/shared";
import type { GalleryDisplayMode } from "../ui-types";
import { GalleryItem } from "./GalleryItem";

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
  onClearSelection: () => void;
  onApplySelectionRect: (itemIds: string[], mode: "replace" | "add") => void;
  renderItemActions: (item: LibraryItem) => ReactNode;
  onRequestUpload: () => void;
};

const SELECTION_DRAG_THRESHOLD = 4;

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

export function GalleryGrid({
  items,
  isBusy,
  displayMode,
  thumbnailSize,
  selectedItemIds,
  onSelectItem,
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

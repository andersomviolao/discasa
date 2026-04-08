export type SettingsSection = "discord" | "appearance" | "window";
export type WindowState = "default" | "maximized";

export type FixedLibraryViewId = "all-files" | "favorites" | "trash";
export type FixedCollectionViewId = "pictures" | "videos" | "others";

export type SidebarView =
  | { kind: "library"; id: FixedLibraryViewId }
  | { kind: "collection"; id: FixedCollectionViewId }
  | { kind: "album"; id: string };

export type AlbumContextMenuState = {
  x: number;
  y: number;
  albumId: string;
  albumName: string;
} | null;

export type GalleryDisplayMode = "free" | "square";
export type MouseWheelBehavior = "zoom" | "navigate";

export type ViewerDraftState = {
  zoomLevel: number;
  rotationDegrees: number;
  hasCrop: boolean;
  canUndo: boolean;
};

export type ViewerState = {
  itemId: string;
  index: number;
  total: number;
} | null;

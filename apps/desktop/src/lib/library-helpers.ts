import type { AlbumRecord, LibraryItem } from "@discasa/shared";
import type { SidebarView } from "../ui-types";

export const DEFAULT_PROFILE = {
  nickname: "discord-nick",
  server: "discord-server",
} as const;

export function isImage(item: LibraryItem): boolean {
  return item.mimeType.startsWith("image/");
}

export function isVideo(item: LibraryItem): boolean {
  return item.mimeType.startsWith("video/");
}

export function isOther(item: LibraryItem): boolean {
  return !isImage(item) && !isVideo(item);
}

export function getVisibleItems(items: LibraryItem[], selectedView: SidebarView): LibraryItem[] {
  switch (selectedView.kind) {
    case "library":
      if (selectedView.id === "all-files") {
        return items.filter((item) => !item.isTrashed);
      }

      if (selectedView.id === "favorites") {
        return items.filter((item) => item.isFavorite && !item.isTrashed);
      }

      return items.filter((item) => item.isTrashed);
    case "collection":
      if (selectedView.id === "pictures") {
        return items.filter((item) => !item.isTrashed && isImage(item));
      }

      if (selectedView.id === "videos") {
        return items.filter((item) => !item.isTrashed && isVideo(item));
      }

      return items.filter((item) => !item.isTrashed && isOther(item));
    case "album":
      return items.filter((item) => !item.isTrashed && item.albumIds.includes(selectedView.id));
    default:
      return [];
  }
}

export function getCurrentTitle(selectedView: SidebarView, albums: AlbumRecord[]): string {
  switch (selectedView.kind) {
    case "library":
      if (selectedView.id === "all-files") return "All Files";
      if (selectedView.id === "favorites") return "Favorites";
      return "Trash";
    case "collection":
      if (selectedView.id === "pictures") return "Pictures";
      if (selectedView.id === "videos") return "Videos";
      return "Others";
    case "album":
      return albums.find((album) => album.id === selectedView.id)?.name ?? "Album";
    default:
      return "Library";
  }
}

export function getCurrentDescription(selectedView: SidebarView): string {
  switch (selectedView.kind) {
    case "library":
      if (selectedView.id === "all-files") return "All active files in the library.";
      if (selectedView.id === "favorites") return "Files marked as favorites.";
      return "Items moved to the trash.";
    case "collection":
      if (selectedView.id === "pictures") return "Image files only.";
      if (selectedView.id === "videos") return "Video files only.";
      return "Files that are neither images nor videos.";
    case "album":
      return "Files linked to this album.";
    default:
      return "";
  }
}

export function getFileTypeLabel(item: LibraryItem): string {
  if (item.isTrashed) return "TRASH";
  if (isImage(item)) return "IMG";
  if (isVideo(item)) return "VID";
  return "FILE";
}

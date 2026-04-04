import type { MouseEvent } from "react";
import type { AlbumRecord } from "@discasa/shared";
import type { SidebarView } from "../ui-types";
import { ChevronLeftDoubleIcon, ChevronRightDoubleIcon, FolderIcon, HeartIcon, LibraryIcon, PictureIcon, PlusIcon, TrashIcon, VideoIcon } from "./icons";
import { ProfileAvatar } from "./ProfileAvatar";

const libraryEntries = [
  { id: "all-files", label: "All Files", icon: LibraryIcon },
  { id: "favorites", label: "Favorites", icon: HeartIcon },
  { id: "trash", label: "Trash", icon: TrashIcon },
] as const;

const collectionEntries = [
  { id: "pictures", label: "Pictures", icon: PictureIcon },
  { id: "videos", label: "Videos", icon: VideoIcon },
  { id: "others", label: "Others", icon: FolderIcon },
] as const;

type SidebarProps = {
  albums: AlbumRecord[];
  selectedView: SidebarView;
  isSidebarCollapsed: boolean;
  profile: {
    nickname: string;
    server: string;
    avatarUrl: string | null;
  };
  onToggleSidebar: () => void;
  onOpenView: (view: SidebarView) => void;
  onOpenCreateAlbum: () => void;
  onOpenAlbumContextMenu: (event: MouseEvent<HTMLElement>, albumId: string, albumName: string) => void;
};

export function Sidebar({
  albums,
  selectedView,
  isSidebarCollapsed,
  profile,
  onToggleSidebar,
  onOpenView,
  onOpenCreateAlbum,
  onOpenAlbumContextMenu,
}: SidebarProps) {
  return (
    <aside className={`sidebar-panel panel-surface ${isSidebarCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-topbar">
        <button
          type="button"
          className="icon-circle-button sidebar-toggle-button"
          onClick={onToggleSidebar}
          aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isSidebarCollapsed ? <ChevronRightDoubleIcon /> : <ChevronLeftDoubleIcon />}
        </button>
      </div>

      <div className="sidebar-scroll scrollable-y subtle-scrollbar sidebar-scrollbar-host">
        <section className="sidebar-section">
          {!isSidebarCollapsed ? <h2 className="sidebar-section-title">Library</h2> : null}

          {libraryEntries.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`sidebar-item ${selectedView.kind === "library" && selectedView.id === id ? "selected" : ""}`}
              onClick={() => onOpenView({ kind: "library", id })}
              title={label}
            >
              <span className="sidebar-item-icon"><Icon /></span>
              {!isSidebarCollapsed ? <span className="sidebar-item-label">{label}</span> : null}
            </button>
          ))}
        </section>

        <section className="sidebar-section">
          {!isSidebarCollapsed ? <h2 className="sidebar-section-title">Collections</h2> : null}

          {collectionEntries.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`sidebar-item ${selectedView.kind === "collection" && selectedView.id === id ? "selected" : ""}`}
              onClick={() => onOpenView({ kind: "collection", id })}
              title={label}
            >
              <span className="sidebar-item-icon"><Icon /></span>
              {!isSidebarCollapsed ? <span className="sidebar-item-label">{label}</span> : null}
            </button>
          ))}
        </section>

        <section className="sidebar-section">
          {!isSidebarCollapsed ? <h2 className="sidebar-section-title">Albums</h2> : null}

          {albums.map((album) => (
            <button
              key={album.id}
              type="button"
              className={`sidebar-item ${selectedView.kind === "album" && selectedView.id === album.id ? "selected" : ""}`}
              onClick={() => onOpenView({ kind: "album", id: album.id })}
              onContextMenu={(event) => onOpenAlbumContextMenu(event, album.id, album.name)}
              title={album.name}
            >
              <span className="sidebar-item-icon"><FolderIcon /></span>
              {!isSidebarCollapsed ? <span className="sidebar-item-label">{album.name}</span> : null}
            </button>
          ))}

          {!isSidebarCollapsed ? (
            <button
              type="button"
              className="sidebar-item"
              onClick={onOpenCreateAlbum}
              title="Create album"
            >
              <span className="sidebar-item-icon"><PlusIcon /></span>
              <span className="sidebar-item-label">Create album</span>
            </button>
          ) : null}
        </section>
      </div>

      <footer className="sidebar-profile">
        <ProfileAvatar avatarUrl={profile.avatarUrl} className="profile-avatar" />
        {!isSidebarCollapsed ? (
          <div className="profile-copy">
            <span className="profile-primary">{profile.nickname}</span>
            <span className="profile-secondary">{profile.server}</span>
          </div>
        ) : null}
      </footer>
    </aside>
  );
}

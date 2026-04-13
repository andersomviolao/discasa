export const DISCASA_CATEGORY_NAME = "Discasa";
export const DISCASA_CHANNELS = ["discasa-drive", "discasa-index", "discasa-folder", "discasa-trash", "discasa-config"] as const;

export type GuildSummary = {
  id: string;
  name: string;
  owner: boolean;
  permissions: string[];
};

export type AppSession = {
  authenticated: boolean;
  user: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  } | null;
  activeGuild: {
    id: string;
    name: string;
  } | null;
};

export type DiscasaAttachmentRecoveryWarning = {
  itemId: string;
  itemName: string;
  storageState: "drive" | "trash" | "unknown";
  reason: string;
};

export type DiscasaInitializationResponse = {
  guildId: string;
  categoryName: string;
  channels: readonly string[] | string[];
  recovery: {
    relinkedItemCount: number;
    unresolvedItems: DiscasaAttachmentRecoveryWarning[];
  };
};

export type AlbumRecord = {
  id: string;
  name: string;
  itemCount: number;
};

export type CreateAlbumInput = {
  name: string;
};

export type RenameAlbumInput = {
  name: string;
};

export type LibraryItemOriginalSource = {
  attachmentUrl: string;
  storageChannelId?: string;
  storageMessageId?: string;
};

export type LibraryItemSavedMediaEdit = {
  rotationDegrees: number;
  hasCrop: boolean;
  savedAt: string;
};

export type SaveLibraryItemMediaEditInput = {
  rotationDegrees: number;
  hasCrop: boolean;
};

export type LibraryItemAttachmentStatus = "ready" | "missing";

export type LibraryItem = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  status: string;
  guildId: string;
  albumIds: string[];
  uploadedAt: string;
  attachmentUrl: string;
  attachmentStatus?: LibraryItemAttachmentStatus;
  isFavorite: boolean;
  isTrashed: boolean;
  storageChannelId?: string;
  storageMessageId?: string;
  originalSource?: LibraryItemOriginalSource | null;
  savedMediaEdit?: LibraryItemSavedMediaEdit | null;
};

export type LibraryItemIndex = Omit<LibraryItem, "albumIds">;

export type FolderNode = {
  id: string;
  type: "album";
  name: string;
  parentId: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type FolderMembership = {
  folderId: string;
  itemId: string;
  addedAt: string;
};

export type DiscasaConfig = {
  accentColor: string;
  minimizeToTray: boolean;
  closeToTray: boolean;
  thumbnailZoomPercent: number;
  viewerMouseWheelBehavior: "zoom" | "navigate";
  sidebarCollapsed: boolean;
};

export const DISCASA_DEFAULT_CONFIG: DiscasaConfig = {
  accentColor: "#E9881D",
  minimizeToTray: false,
  closeToTray: false,
  thumbnailZoomPercent: 35,
  viewerMouseWheelBehavior: "zoom",
  sidebarCollapsed: false,
};

export type PersistedIndexSnapshot = {
  version: 2;
  updatedAt: string;
  items: LibraryItemIndex[];
};

export type PersistedFolderSnapshot = {
  version: 1;
  updatedAt: string;
  folders: FolderNode[];
  memberships: FolderMembership[];
};

export type PersistedConfigSnapshot = {
  version: 1;
  updatedAt: string;
  config: DiscasaConfig;
};

export type UploadResponse = {
  uploaded: LibraryItem[];
};

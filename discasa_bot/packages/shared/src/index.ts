export const DISCASA_CATEGORY_NAME = "Discasa";
export const DISCASA_CHANNELS = ["discasa-drive", "discasa-index", "discasa-trash"] as const;

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

export type DiscasaDriveImportResult = {
  imported: LibraryItem[];
  scannedAttachmentCount: number;
  skippedAttachmentCount: number;
  skippedGroupedMessageCount: number;
};

export type DiscasaLocalMirrorImportResult = {
  imported: LibraryItem[];
  scannedFileCount: number;
  skippedFileCount: number;
};

export type DiscasaExternalImportResult = {
  imported: LibraryItem[];
  discordDrive: DiscasaDriveImportResult;
  localMirror: DiscasaLocalMirrorImportResult;
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
  storageManifest?: LibraryItemStorageManifest | null;
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

export type LibraryItemStoragePart = {
  index: number;
  fileName: string;
  size: number;
  sha256: string;
  attachmentUrl: string;
  storageChannelId: string;
  storageMessageId: string;
};

export type LibraryItemStorageManifest = {
  mode: "chunked";
  version: 1;
  chunkSize: number;
  totalChunks: number;
  totalSize: number;
  sha256: string;
  parts: LibraryItemStoragePart[];
};

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
  storageManifest?: LibraryItemStorageManifest | null;
  originalSource?: LibraryItemOriginalSource | null;
  savedMediaEdit?: LibraryItemSavedMediaEdit | null;
  contentUrl?: string;
  thumbnailUrl?: string;
  localMirrorAvailable?: boolean;
};

export type LibraryItemIndex = Omit<LibraryItem, "albumIds" | "contentUrl" | "thumbnailUrl" | "localMirrorAvailable">;

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
  galleryDisplayMode: "free" | "square";
  viewerMouseWheelBehavior: "zoom" | "navigate";
  mediaPreviewVolume: number;
  sidebarCollapsed: boolean;
  localMirrorEnabled: boolean;
  localMirrorPath: string | null;
};

export const DISCASA_DEFAULT_CONFIG: DiscasaConfig = {
  accentColor: "#E9881D",
  minimizeToTray: false,
  closeToTray: false,
  thumbnailZoomPercent: 35,
  galleryDisplayMode: "free",
  viewerMouseWheelBehavior: "zoom",
  mediaPreviewVolume: 0.8,
  sidebarCollapsed: false,
  localMirrorEnabled: false,
  localMirrorPath: null,
};

export type LocalStorageStatus = {
  localMirrorEnabled: boolean;
  configuredMirrorPath: string | null;
  resolvedMirrorPath: string;
  localMirrorPathExists: boolean;
  localMirrorSetupRequired: boolean;
  defaultMirrorPath: string;
  mirroredFileCount: number;
  thumbnailCachePath: string;
  thumbnailCacheFileCount: number;
  thumbnailCacheBytes: number;
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

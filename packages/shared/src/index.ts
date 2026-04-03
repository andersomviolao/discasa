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
};

export type DiscasaInitializationResponse = {
  guildId: string;
  categoryName: string;
  channels: readonly string[] | string[];
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
  isFavorite: boolean;
  isTrashed: boolean;
};

export type UploadResponse = {
  uploaded: LibraryItem[];
};

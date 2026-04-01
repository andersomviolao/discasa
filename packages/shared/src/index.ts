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
  } | null;
};

export type DiscasaInitializationResponse = {
  guildId: string;
  categoryName: string;
  channels: readonly string[] | string[];
};

export type CollectionRecord = {
  id: string;
  name: string;
  itemCount: number;
};

export type CreateCollectionInput = {
  name: string;
};

export type LibraryItem = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  status: string;
  guildId: string;
  collectionIds: string[];
  uploadedAt: string;
  attachmentUrl: string;
};

export type UploadResponse = {
  uploaded: LibraryItem[];
};

export const DEFAULT_COLLECTIONS: CollectionRecord[] = [
  { id: "album-test-1", name: "Album Test 1", itemCount: 0 },
  { id: "album-test-pictures", name: "Album test pictures", itemCount: 0 },
];

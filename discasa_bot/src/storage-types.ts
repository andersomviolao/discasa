import type { LibraryItemStorageManifest } from "@discasa/shared";

export type ActiveStorageContext = {
  guildId: string;
  guildName: string;
  categoryId: string;
  categoryName: string;
  driveChannelId: string;
  driveChannelName: string;
  indexChannelId: string;
  indexChannelName: string;
  folderChannelId: string;
  folderChannelName: string;
  trashChannelId: string;
  trashChannelName: string;
  configChannelId: string;
  configChannelName: string;
};

export type UploadedFileRecord = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  guildId: string;
  attachmentUrl: string;
  storageChannelId?: string;
  storageMessageId?: string;
  storageManifest?: LibraryItemStorageManifest | null;
};

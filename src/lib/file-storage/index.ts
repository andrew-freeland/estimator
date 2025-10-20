import "server-only";
import { IS_DEV, IS_VERCEL_ENV } from "lib/const";
import type { FileStorage } from "./file-storage.interface";
import { createS3FileStorage } from "./s3-file-storage";
import { createVercelBlobStorage } from "./vercel-blob-storage";
import { createGCSFileStorage } from "lib/gcp/storage";
import logger from "logger";

export type FileStorageDriver = "vercel-blob" | "s3" | "gcs";

const resolveDriver = (): FileStorageDriver => {
  const candidate = process.env.FILE_STORAGE_TYPE;
  const normalized = candidate?.trim().toLowerCase();

  // If running on Vercel and storage type isn't explicitly set, prefer vercel-blob.
  if (IS_VERCEL_ENV && !normalized) {
    return "vercel-blob";
  }

  if (
    normalized === "vercel-blob" ||
    normalized === "s3" ||
    normalized === "gcs"
  ) {
    return normalized as FileStorageDriver;
  }

  // Fallback default: vercel-blob for cloud deployments, otherwise gcs as legacy default
  return IS_VERCEL_ENV ? "vercel-blob" : "gcs";
};

declare global {
  // eslint-disable-next-line no-var
  var __server__file_storage__: FileStorage | undefined;
}

const storageDriver = resolveDriver();

const createFileStorage = (): FileStorage => {
  logger.info(`Initializing file storage driver: ${storageDriver}`);
  if (storageDriver === "vercel-blob") {
    return createVercelBlobStorage();
  } else if (storageDriver === "s3") {
    return createS3FileStorage();
  } else {
    return createGCSFileStorage();
  }
};

const serverFileStorage =
  globalThis.__server__file_storage__ || createFileStorage();

if (IS_DEV) {
  globalThis.__server__file_storage__ = serverFileStorage;
}

export const fileStorage = serverFileStorage;
export const fileStorageDriver = storageDriver;
export { serverFileStorage, storageDriver };

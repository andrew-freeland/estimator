// @module: gcp_storage
// Google Cloud Storage adapter for Estimator Assistant MCP
// Replaces Vercel Blob with GCS for file storage and retrieval

import "server-only";
import { Storage } from "@google-cloud/storage";
import path from "node:path";
import { FileNotFoundError } from "lib/errors";
import type {
  FileMetadata,
  FileStorage,
  UploadOptions,
} from "../file-storage/file-storage.interface";
import {
  resolveStoragePrefix,
  sanitizeFilename,
  toBuffer,
} from "../file-storage/storage-utils";
import { generateUUID } from "lib/utils";
import logger from "lib/logger";

// EA_ prefix for Estimator Assistant
const EA_GCS_BUCKET_NAME = process.env.EA_GCS_BUCKET_NAME;
const EA_GCP_PROJECT_ID = process.env.EA_GCP_PROJECT_ID;

if (!EA_GCS_BUCKET_NAME) {
  throw new Error("EA_GCS_BUCKET_NAME environment variable is required");
}

if (!EA_GCP_PROJECT_ID) {
  throw new Error("EA_GCP_PROJECT_ID environment variable is required");
}

// Initialize GCS client
const storage = new Storage({
  projectId: EA_GCP_PROJECT_ID,
});

const bucket = storage.bucket(EA_GCS_BUCKET_NAME);

const STORAGE_PREFIX = resolveStoragePrefix();

const buildPathname = (filename: string) => {
  const safeName = sanitizeFilename(filename);
  const id = generateUUID();
  const prefix = STORAGE_PREFIX ? `${STORAGE_PREFIX}/` : "";
  return path.posix.join(prefix, `${id}-${safeName}`);
};

const mapMetadata = (
  key: string,
  info: { contentType: string; size: number; uploadedAt?: Date },
) =>
  ({
    key,
    filename: path.posix.basename(key),
    contentType: info.contentType,
    size: info.size,
    uploadedAt: info.uploadedAt,
  }) satisfies FileMetadata;

const getFileInfo = async (key: string) => {
  try {
    const [metadata] = await bucket.file(key).getMetadata();
    return {
      contentType: metadata.contentType || "application/octet-stream",
      size: parseInt(metadata.size || "0"),
      uploadedAt: metadata.timeCreated ? new Date(metadata.timeCreated) : undefined,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("404")) {
      throw new FileNotFoundError(key, error);
    }
    throw error;
  }
};

const fetchSourceBuffer = async (key: string) => {
  try {
    const [buffer] = await bucket.file(key).download();
    return buffer;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("404")) {
      throw new FileNotFoundError(key);
    }
    throw error;
  }
};

export const createGCSFileStorage = (): FileStorage => {
  return {
    async upload(content, options: UploadOptions = {}) {
      const buffer = await toBuffer(content);
      const filename = options.filename ?? "file";
      const pathname = buildPathname(filename);

      const file = bucket.file(pathname);
      
      await file.save(buffer, {
        metadata: {
          contentType: options.contentType || "application/octet-stream",
        },
        public: true, // Make files publicly accessible
      });

      const metadata: FileMetadata = {
        key: pathname,
        filename: path.posix.basename(pathname),
        contentType: options.contentType || "application/octet-stream",
        size: buffer.byteLength,
        uploadedAt: new Date(),
      };

      // Generate public URL
      const sourceUrl = `https://storage.googleapis.com/${EA_GCS_BUCKET_NAME}/${pathname}`;

      return {
        key: pathname,
        sourceUrl,
        metadata,
      };
    },

    async createUploadUrl() {
      // GCS signed URL generation for direct client uploads
      const filename = `temp-${generateUUID()}`;
      const pathname = buildPathname(filename);
      
      const file = bucket.file(pathname);
      
      const [signedUrl] = await file.getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType: "application/octet-stream",
      });

      return {
        uploadUrl: signedUrl,
        key: pathname,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      };
    },

    async download(key) {
      return fetchSourceBuffer(key);
    },

    async delete(key) {
      try {
        await bucket.file(key).delete();
      } catch (error: unknown) {
        if (error instanceof Error && error.message.includes("404")) {
          // File doesn't exist, consider it deleted
          return;
        }
        throw error;
      }
    },

    async exists(key) {
      try {
        const [exists] = await bucket.file(key).exists();
        return exists;
      } catch (error: unknown) {
        logger.error("Error checking file existence:", error);
        return false;
      }
    },

    async getMetadata(key) {
      try {
        const info = await getFileInfo(key);
        return mapMetadata(key, info);
      } catch (error: unknown) {
        if (error instanceof FileNotFoundError) {
          return null;
        }
        throw error;
      }
    },

    async getSourceUrl(key) {
      try {
        await getFileInfo(key); // Verify file exists
        return `https://storage.googleapis.com/${EA_GCS_BUCKET_NAME}/${key}`;
      } catch (error: unknown) {
        if (error instanceof FileNotFoundError) {
          return null;
        }
        throw error;
      }
    },

    async getDownloadUrl(key) {
      try {
        await getFileInfo(key); // Verify file exists
        // For public files, return the public URL
        return `https://storage.googleapis.com/${EA_GCS_BUCKET_NAME}/${key}`;
      } catch (error: unknown) {
        if (error instanceof FileNotFoundError) {
          return null;
        }
        throw error;
      }
    },
  } satisfies FileStorage;
};

// Export the storage instance
export const gcsFileStorage = createGCSFileStorage();

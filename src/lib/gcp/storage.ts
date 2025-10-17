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

// PII redaction utilities
const PII_PATTERNS = [
  // Phone numbers
  /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
  // Email addresses
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // SSN (basic pattern)
  /\b\d{3}-?\d{2}-?\d{4}\b/g,
  // Credit card numbers (basic pattern)
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
];

function redactPII(text: string): string {
  let redacted = text;

  PII_PATTERNS.forEach((pattern) => {
    redacted = redacted.replace(pattern, "[REDACTED]");
  });

  return redacted;
}

// EA_ prefix for Estimator Assistant
// Runtime-safe GCS client initialization - lazy loading
let storageInstance: Storage | null = null;

async function getGCSClient() {
  if (storageInstance) {
    return storageInstance;
  }

  const EA_GCS_BUCKET_NAME = process.env.EA_GCS_BUCKET_NAME;
  const EA_GCP_PROJECT_ID = process.env.EA_GCP_PROJECT_ID;

  if (!EA_GCS_BUCKET_NAME) {
    throw new Error("EA_GCS_BUCKET_NAME environment variable is required");
  }

  if (!EA_GCP_PROJECT_ID) {
    throw new Error("EA_GCP_PROJECT_ID environment variable is required");
  }

  // Initialize GCS client
  storageInstance = new Storage({
    projectId: EA_GCP_PROJECT_ID,
  });

  return storageInstance;
}

async function getGCSBucketName() {
  const EA_GCS_BUCKET_NAME = process.env.EA_GCS_BUCKET_NAME;
  if (!EA_GCS_BUCKET_NAME) {
    throw new Error("EA_GCS_BUCKET_NAME environment variable is required");
  }
  return EA_GCS_BUCKET_NAME;
}

// Lazy bucket getter
async function getGCSBucket() {
  const storage = await getGCSClient();
  const bucketName = await getGCSBucketName();
  return storage.bucket(bucketName);
}

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
    const bucket = await getGCSBucket();
    const [metadata] = await bucket.file(key).getMetadata();
    return {
      contentType: metadata.contentType || "application/octet-stream",
      size: parseInt(String(metadata.size || "0")),
      uploadedAt: metadata.timeCreated
        ? new Date(metadata.timeCreated)
        : undefined,
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
    const bucket = await getGCSBucket();
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

      // Validate file size (max 100MB for general files)
      const maxSize = options.maxSize || 100 * 1024 * 1024; // 100MB default
      if (buffer.byteLength > maxSize) {
        throw new Error(
          `File too large. Maximum size is ${maxSize / 1024 / 1024}MB`,
        );
      }

      // Validate MIME type if provided
      if (options.allowedTypes && options.contentType) {
        if (!options.allowedTypes.includes(options.contentType)) {
          throw new Error(
            `File type not allowed. Allowed types: ${options.allowedTypes.join(", ")}`,
          );
        }
      }

      // Redact PII from text content if it's a text file
      let processedBuffer = buffer;
      if (
        options.contentType?.startsWith("text/") &&
        options.redactPII !== false
      ) {
        const text = buffer.toString("utf-8");
        const redactedText = redactPII(text);
        if (redactedText !== text) {
          logger.info(`PII redacted from file ${filename}`);
          processedBuffer = Buffer.from(redactedText, "utf-8");
        }
      }

      const bucket = await getGCSBucket();
      const file = bucket.file(pathname);

      await file.save(processedBuffer, {
        metadata: {
          contentType: options.contentType || "application/octet-stream",
        },
        public: true, // Make files publicly accessible
      });

      const metadata: FileMetadata = {
        key: pathname,
        filename: path.posix.basename(pathname),
        contentType: options.contentType || "application/octet-stream",
        size: processedBuffer.byteLength,
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

      const bucket = await getGCSBucket();
      const file = bucket.file(pathname);

      const [signedUrl] = await file.getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType: "application/octet-stream",
      });

      return {
        url: signedUrl,
        key: pathname,
        method: "PUT" as const,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      };
    },

    async download(key) {
      return fetchSourceBuffer(key);
    },

    async delete(key) {
      try {
        const bucket = await getGCSBucket();
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
        const bucket = await getGCSBucket();
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

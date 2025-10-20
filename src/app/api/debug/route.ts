// New: lightweight masked debug route for quick health checks
import { NextResponse } from "next/server";
import { fileStorageDriver } from "lib/file-storage";
import { IS_VERCEL_ENV } from "lib/const";

function mask(value: string | undefined) {
  if (!value) return "not set";
  if (value.length <= 6) return value.replace(/./g, "*");
  return value.slice(0, 3) + value.slice(-3).replace(/./g, "*");
}

export async function GET() {
  try {
    // Minimal checks - do not try to connect to external services here to avoid slowdowns
    const envSummary = {
      NODE_ENV: process.env.NODE_ENV || "not set",
      VERCEL: process.env.VERCEL || "not set",
      BETTER_AUTH_SECRET: mask(process.env.BETTER_AUTH_SECRET),
      OPENAI_API_KEY: mask(process.env.OPENAI_API_KEY),
      FILE_STORAGE_TYPE: process.env.FILE_STORAGE_TYPE || fileStorageDriver,
      BLOB_READ_WRITE_TOKEN: mask(process.env.BLOB_READ_WRITE_TOKEN),
      EA_GCS_BUCKET_NAME: mask(process.env.EA_GCS_BUCKET_NAME),
    };

    const storageCheck = {
      driver: fileStorageDriver,
      directUploadSupported: ["vercel-blob", "s3", "gcs"].includes(
        fileStorageDriver,
      ),
      message:
        fileStorageDriver === "vercel-blob"
          ? "Ensure BLOB_READ_WRITE_TOKEN is set for direct uploads"
          : fileStorageDriver === "gcs"
            ? "Ensure EA_GCS_BUCKET_NAME & GCP auth are configured"
            : "Ensure S3 keys are set for s3 driver",
    };

    return NextResponse.json({
      status: "ok",
      env: envSummary,
      storage: storageCheck,
      meta: {
        isVercel: !!IS_VERCEL_ENV,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: String(err) },
      { status: 500 },
    );
  }
}

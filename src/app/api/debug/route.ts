import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { config } from "@/lib/config";

export async function GET(request: NextRequest) {
  try {
    // Only allow debug in development or with special header
    const isDebugAllowed =
      process.env.NODE_ENV === "development" ||
      request.headers.get("x-debug") === "true";

    if (!isDebugAllowed) {
      return NextResponse.json(
        { error: "Debug endpoint not available" },
        { status: 403 },
      );
    }

    const debugInfo = {
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        VERCEL_ENV: process.env.VERCEL_ENV,
        VERCEL_URL: process.env.VERCEL_URL,
      },
      config: {
        NODE_ENV: config.NODE_ENV,
        BASE_URL: config.BASE_URL,
        FILE_STORAGE_TYPE: config.FILE_STORAGE_TYPE,
        LOG_LEVEL: config.LOG_LEVEL,
      },
      env: {
        DATABASE_URL: env.DATABASE_URL ? "configured" : "not configured",
        EA_GCP_PROJECT_ID: env.EA_GCP_PROJECT_ID
          ? "configured"
          : "not configured",
        EA_GCS_BUCKET_NAME: env.EA_GCS_BUCKET_NAME
          ? "configured"
          : "not configured",
        OPENAI_API_KEY: env.OPENAI_API_KEY ? "configured" : "not configured",
        BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET
          ? "configured"
          : "not configured",
      },
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(debugInfo, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Debug endpoint failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

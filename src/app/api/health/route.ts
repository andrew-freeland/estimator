// @module: health_check_api
// Health check API endpoint for Estimator Assistant MCP
// Tests connectivity to database, GCS, and external services

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { checkDatabaseHealth } from "lib/gcp/db";
import { gcsFileStorage } from "lib/gcp/storage";
import { config } from "lib/config";
import logger from "lib/logger";

// Health check interfaces
interface HealthCheck {
  service: string;
  status: "healthy" | "unhealthy" | "degraded";
  responseTime: number;
  error?: string;
  details?: Record<string, any>;
}

interface HealthResponse {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  version: string;
  environment: string;
  checks: HealthCheck[];
  uptime: number;
}

// Service health check functions
async function checkDatabase(): Promise<HealthCheck> {
  const startTime = Date.now();

  try {
    const isHealthy = await checkDatabaseHealth();
    const responseTime = Date.now() - startTime;

    return {
      service: "database",
      status: isHealthy ? "healthy" : "unhealthy",
      responseTime,
      details: {
        type: "postgresql",
        url: config.EA_DATABASE_URL ? "configured" : "not configured",
      },
    };
  } catch (error) {
    return {
      service: "database",
      status: "unhealthy",
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function checkGCS(): Promise<HealthCheck> {
  const startTime = Date.now();

  try {
    // Test GCS connectivity by checking if we can access the bucket
    const testKey = `health-check-${Date.now()}`;
    const testContent = "health check";

    // Try to upload a small test file
    const uploadResult = await gcsFileStorage.upload(Buffer.from(testContent), {
      filename: testKey,
      contentType: "text/plain",
    });

    // Try to download it back
    const _downloadResult = await gcsFileStorage.download(uploadResult.key);

    // Clean up the test file
    await gcsFileStorage.delete(uploadResult.key);

    const responseTime = Date.now() - startTime;

    return {
      service: "gcs",
      status: "healthy",
      responseTime,
      details: {
        bucket: config.EA_GCS_BUCKET_NAME,
        project: config.EA_GCP_PROJECT_ID,
        region: config.EA_GCP_REGION,
      },
    };
  } catch (error) {
    return {
      service: "gcs",
      status: "unhealthy",
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
      details: {
        bucket: config.EA_GCS_BUCKET_NAME,
        project: config.EA_GCP_PROJECT_ID,
      },
    };
  }
}

async function checkOpenAI(): Promise<HealthCheck> {
  const startTime = Date.now();

  try {
    // Test OpenAI API connectivity with a simple request
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      },
    });

    const responseTime = Date.now() - startTime;

    if (response.ok) {
      return {
        service: "openai",
        status: "healthy",
        responseTime,
        details: {
          apiKey: "configured",
          models: "accessible",
        },
      };
    } else {
      return {
        service: "openai",
        status: "unhealthy",
        responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  } catch (error) {
    return {
      service: "openai",
      status: "unhealthy",
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function checkWhisper(): Promise<HealthCheck> {
  const startTime = Date.now();

  try {
    // Test Whisper API connectivity
    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        },
      },
    );

    const responseTime = Date.now() - startTime;

    // Whisper endpoint returns 400 for invalid requests, which is expected
    if (response.status === 400 || response.status === 200) {
      return {
        service: "whisper",
        status: "healthy",
        responseTime,
        details: {
          model: config.EA_TRANSCRIPTION_MODEL,
          apiKey: "configured",
        },
      };
    } else {
      return {
        service: "whisper",
        status: "unhealthy",
        responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  } catch (error) {
    return {
      service: "whisper",
      status: "unhealthy",
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function checkExternalServices(): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  // Check Buildertrend if enabled
  if (config.EA_BUILDERTREND_API_KEY) {
    const startTime = Date.now();
    try {
      const response = await fetch(config.EA_BUILDERTREND_BASE_URL, {
        headers: {
          Authorization: `Bearer ${config.EA_BUILDERTREND_API_KEY}`,
        },
      });

      checks.push({
        service: "buildertrend",
        status: response.ok ? "healthy" : "unhealthy",
        responseTime: Date.now() - startTime,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      });
    } catch (error) {
      checks.push({
        service: "buildertrend",
        status: "unhealthy",
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Check Google Maps if enabled
  if (config.EA_GOOGLE_MAPS_API_KEY) {
    const startTime = Date.now();
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=test&key=${config.EA_GOOGLE_MAPS_API_KEY}`,
      );

      checks.push({
        service: "google_maps",
        status: response.ok ? "healthy" : "unhealthy",
        responseTime: Date.now() - startTime,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      });
    } catch (error) {
      checks.push({
        service: "google_maps",
        status: "unhealthy",
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return checks;
}

// Main health check handler
export async function GET(_request: NextRequest) {
  const _startTime = Date.now();

  try {
    // Run all health checks in parallel
    const [
      databaseCheck,
      gcsCheck,
      openaiCheck,
      whisperCheck,
      ...externalChecks
    ] = await Promise.all([
      checkDatabase(),
      checkGCS(),
      checkOpenAI(),
      checkWhisper(),
      ...(await checkExternalServices()),
    ]);

    const allChecks = [
      databaseCheck,
      gcsCheck,
      openaiCheck,
      whisperCheck,
      ...externalChecks,
    ];

    // Determine overall status
    const hasUnhealthy = allChecks.some(
      (check) => check.status === "unhealthy",
    );
    const hasDegraded = allChecks.some((check) => check.status === "degraded");

    let overallStatus: "healthy" | "unhealthy" | "degraded";
    if (hasUnhealthy) {
      overallStatus = "unhealthy";
    } else if (hasDegraded) {
      overallStatus = "degraded";
    } else {
      overallStatus = "healthy";
    }

    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
      environment: config.NODE_ENV,
      checks: allChecks,
      uptime: process.uptime(),
    };

    // Set appropriate HTTP status code
    const httpStatus =
      overallStatus === "healthy"
        ? 200
        : overallStatus === "degraded"
          ? 200
          : 503;

    return NextResponse.json(response, { status: httpStatus });
  } catch (error) {
    logger.error("Health check failed:", error);

    const errorResponse: HealthResponse = {
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
      environment: config.NODE_ENV,
      checks: [],
      uptime: process.uptime(),
    };

    return NextResponse.json(errorResponse, { status: 503 });
  }
}

// Simple health check for load balancers
export async function HEAD(_request: NextRequest) {
  try {
    // Quick database check
    const isHealthy = await checkDatabaseHealth();
    return new NextResponse(null, { status: isHealthy ? 200 : 503 });
  } catch (_error) {
    return new NextResponse(null, { status: 503 });
  }
}

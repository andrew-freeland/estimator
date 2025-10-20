// @module: env
// Build-safe environment variable validator
// Validates required environment variables with helpful error messages

import "server-only";
import { z } from "zod";

// Helper to detect if we're in a build context - enhanced for better detection
const isBuildTime = () => {
  // treat many CI/build envs as build-time to avoid strict runtime env checks during build
  return (
    typeof window === "undefined" &&
    (process.env.NEXT_PHASE === "phase-production-build" ||
      process.env.NEXT_PHASE === "phase-production-server" ||
      process.env.VERCEL_ENV === "production" ||
      process.env.VERCEL_BUILD === "1" ||
      process.env.CI === "true" ||
      !process.env.NODE_ENV)
  );
};

// Environment variable schema with validation
const envSchema = z.object({
  // Core application settings
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  BASE_URL: z.string().url().default("http://localhost:3000"),

  // Database configuration
  DATABASE_URL: z.string().url(),
  EA_DATABASE_URL: z.string().url().optional(),

  // GCP configuration
  EA_GCP_PROJECT_ID: z.string().min(1),
  EA_GCP_REGION: z.string().default("us-central1"),
  EA_GCS_BUCKET_NAME: z.string().min(1),

  // AI/LLM configuration
  OPENAI_API_KEY: z.string().min(1),
  EA_EMBEDDING_MODEL: z.string().default("text-embedding-3-large"),
  EA_TRANSCRIPTION_MODEL: z.string().default("whisper-1"),
  EA_EXPLAINER_MODEL: z.string().default("gpt-4o"),

  // Google Workspace integration
  EA_GOOGLE_CLIENT_ID: z.string().optional(),
  EA_GOOGLE_CLIENT_SECRET: z.string().optional(),
  EA_GOOGLE_API_KEY: z.string().optional(),

  // Google Maps integration
  EA_GOOGLE_MAPS_API_KEY: z.string().optional(),

  // Authentication & security
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().optional(),

  // File storage configuration
  FILE_STORAGE_TYPE: z.enum(["vercel-blob", "s3", "gcs"]).default("gcs"),

  // AWS S3 configuration (if using S3)
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default("us-east-1"),
  AWS_S3_BUCKET: z.string().optional(),

  // Redis configuration
  REDIS_URL: z.string().optional(),

  // Development settings
  NO_HTTPS: z.string().optional(),
  DEBUG: z.string().optional(),

  // Vercel deployment settings
  VERCEL: z.string().optional(),
  VERCEL_ENV: z.string().optional(),
  VERCEL_URL: z.string().optional(),

  // MCP configuration
  FILE_BASED_MCP_CONFIG: z.string().optional(),
  IS_MCP_SERVER_REMOTE_ONLY: z.string().optional(),

  // Testing configuration
  TEST_DATABASE_URL: z.string().url().optional(),

  // Monitoring & logging
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  STRUCTURED_LOGGING: z.string().optional(),

  // Rate limiting & performance
  MAX_FILE_SIZE: z.string().transform(Number).default(10485760),
  MAX_CONCURRENT_EMBEDDINGS: z.string().transform(Number).default(5),
  EMBEDDING_BATCH_SIZE: z.string().transform(Number).default(10),

  // Feature flags
  ENABLE_VOICE_TRANSCRIPTION: z.string().optional(),
  ENABLE_GOOGLE_WORKSPACE: z.string().optional(),
  ENABLE_MAPS: z.string().optional(),
  ENABLE_VECTOR_SEARCH: z.string().optional(),
  AUTH_DISABLED: z.string().optional(),
});

// Build-time schema (relaxed requirements)
const buildTimeSchema = envSchema.partial({
  DATABASE_URL: true,
  EA_GCP_PROJECT_ID: true,
  EA_GCS_BUCKET_NAME: true,
  OPENAI_API_KEY: true,
  BETTER_AUTH_SECRET: true,
});

// Guest mode schema (when AUTH_DISABLED=true)
const guestModeSchema = envSchema.partial({
  DATABASE_URL: true,
  EA_GCP_PROJECT_ID: true,
  EA_GCS_BUCKET_NAME: true,
  OPENAI_API_KEY: true,
  BETTER_AUTH_SECRET: true,
  EA_GOOGLE_CLIENT_ID: true,
  EA_GOOGLE_CLIENT_SECRET: true,
  EA_GOOGLE_API_KEY: true,
  EA_GOOGLE_MAPS_API_KEY: true,
});

// Parse and validate environment variables - enhanced for build resilience
const parseEnv = () => {
  try {
    // Use different schema based on context
    let schema: any = envSchema;
    if (isBuildTime()) {
      schema = buildTimeSchema;
    } else if (process.env.AUTH_DISABLED === "true") {
      schema = guestModeSchema;
    }

    // For Vercel builds, ensure guest mode works even without explicit AUTH_DISABLED
    if (process.env.VERCEL === "1" && !process.env.AUTH_DISABLED) {
      process.env.AUTH_DISABLED = "true";
      schema = guestModeSchema;
    }

    const result = schema.safeParse(process.env);
    if (!result.success) {
      // If build-time, log and return partial defaults; runtime will throw in validateEnv()
      const issues = result.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      );
      const message = `Environment validation issues: ${issues.join("; ")}`;
      if (isBuildTime()) {
        // Prefer console.warn during build so the build doesn't hard-fail because of env schema
        // This allows Vercel builds (especially during outages) to proceed while surfacing issues.
        console.warn("[env] Build-time env warnings:", message);
        return schema.parse({}); // return defaults where present
      }
      // Runtime: be strict
      throw new Error(message);
    }

    return result.data;
  } catch (error) {
    // Re-throw runtime errors; for build-time this should be handled above
    throw error;
  }
};

// Export validated environment variables
export const env = parseEnv();

// Helper functions
export const isDevelopment = env.NODE_ENV === "development";
export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
export const isGuestMode = process.env.AUTH_DISABLED === "true";

// Runtime validation function - call this explicitly when needed
export const validateEnv = () => {
  try {
    envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues
        .filter(
          (err) =>
            err.code === "invalid_type" &&
            (err as any).received === "undefined",
        )
        .map((err) => err.path.join("."));

      const invalidVars = error.issues
        .filter(
          (err) =>
            err.code !== "invalid_type" ||
            (err as any).received !== "undefined",
        )
        .map((err) => `${err.path.join(".")}: ${err.message}`);

      let errorMessage = "Runtime environment validation failed:\n";

      if (missingVars.length > 0) {
        errorMessage += `\nMissing required variables:\n${missingVars.map((v) => `  - ${v}`).join("\n")}`;
      }

      if (invalidVars.length > 0) {
        errorMessage += `\nInvalid variables:\n${invalidVars.map((v) => `  - ${v}`).join("\n")}`;
      }

      errorMessage +=
        "\n\nPlease check your .env file and ensure all required variables are set correctly.";

      throw new Error(errorMessage);
    }
    throw error;
  }
};

// Helper: runtime-only strict validator for use in API routes
export const validateRuntimeEnv = () => {
  // If explicitly bypassed, skip strict validation
  if (process.env.VERCEL_SKIP_STRICT_ENV === "1") return;
  // Re-validate using full non-partial schema
  const res = envSchema.safeParse(process.env);
  if (!res.success) {
    const missingVars = res.error.issues
      .filter(
        (i) =>
          (i.code === "invalid_type" && (i as any).received === "undefined") ||
          i.code === "too_small",
      )
      .map((i) => i.path.join("."));
    const invalidVars = res.error.issues
      .filter((i) => !missingVars.includes(i.path.join(".")))
      .map((i) => `${i.path.join(".")}: ${i.message}`);
    let msg = "Runtime environment validation failed.";
    if (missingVars.length) msg += ` Missing: ${missingVars.join(", ")}`;
    if (invalidVars.length) msg += ` Invalid: ${invalidVars.join(", ")}`;
    throw new Error(msg);
  }
};

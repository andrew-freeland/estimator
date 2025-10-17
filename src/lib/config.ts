// @module: config
// Centralized configuration management for Estimator Assistant MCP
// Provides type-safe environment variable access with validation

import "server-only";
import { z } from "zod";

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
  EA_EXPLAINER_MODEL: z.string().default("gpt-5"),

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
  REDIS_URL: z.string().url().optional(),

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
});

// Parse and validate environment variables
const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
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

      let errorMessage = "Environment configuration error:\n";

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

// Export validated configuration
export const config = parseEnv();

// Helper functions for common configuration checks
export const isDevelopment = config.NODE_ENV === "development";
export const isProduction = config.NODE_ENV === "production";
export const isTest = config.NODE_ENV === "test";

export const isVercel = Boolean(config.VERCEL);
export const isDocker = Boolean(process.env.DOCKER_BUILD);

// Feature flags
export const features = {
  voiceTranscription: config.ENABLE_VOICE_TRANSCRIPTION === "true",
  googleWorkspace: config.ENABLE_GOOGLE_WORKSPACE === "true",
  maps: config.ENABLE_MAPS === "true",
  vectorSearch: config.ENABLE_VECTOR_SEARCH === "true",
};

// Database configuration
export const dbConfig = {
  url: config.EA_DATABASE_URL || config.DATABASE_URL,
  testUrl: config.TEST_DATABASE_URL,
};

// GCP configuration
export const gcpConfig = {
  projectId: config.EA_GCP_PROJECT_ID,
  region: config.EA_GCP_REGION,
  storageBucket: config.EA_GCS_BUCKET_NAME,
};

// AI configuration
export const aiConfig = {
  openaiApiKey: config.OPENAI_API_KEY,
  embeddingModel: config.EA_EMBEDDING_MODEL,
  transcriptionModel: config.EA_TRANSCRIPTION_MODEL,
  explainerModel: config.EA_EXPLAINER_MODEL,
};

// External service configuration
export const externalServices = {
  google: {
    clientId: config.EA_GOOGLE_CLIENT_ID,
    clientSecret: config.EA_GOOGLE_CLIENT_SECRET,
    apiKey: config.EA_GOOGLE_API_KEY,
  },
  maps: {
    apiKey: config.EA_GOOGLE_MAPS_API_KEY,
  },
};

// File storage configuration
export const storageConfig = {
  type: config.FILE_STORAGE_TYPE,
  maxFileSize: config.MAX_FILE_SIZE,
  aws: {
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    region: config.AWS_REGION,
    bucket: config.AWS_S3_BUCKET,
  },
};

// Performance configuration
export const performanceConfig = {
  maxConcurrentEmbeddings: config.MAX_CONCURRENT_EMBEDDINGS,
  embeddingBatchSize: config.EMBEDDING_BATCH_SIZE,
  maxFileSize: config.MAX_FILE_SIZE,
};

// Logging configuration
export const loggingConfig = {
  level: config.LOG_LEVEL,
  structured: config.STRUCTURED_LOGGING === "true",
  debug: config.DEBUG,
};

// Validate configuration on module load
export const validateConfig = () => {
  const errors: string[] = [];

  // Check required services based on feature flags
  if (
    features.googleWorkspace &&
    (!externalServices.google.clientId || !externalServices.google.clientSecret)
  ) {
    errors.push(
      "Google Workspace integration enabled but missing OAuth credentials",
    );
  }

  if (features.maps && !externalServices.maps.apiKey) {
    errors.push("Maps integration enabled but missing API key");
  }

  // Check file storage configuration
  if (
    storageConfig.type === "s3" &&
    (!storageConfig.aws.accessKeyId ||
      !storageConfig.aws.secretAccessKey ||
      !storageConfig.aws.bucket)
  ) {
    errors.push(
      "S3 storage configured but missing AWS credentials or bucket name",
    );
  }

  if (storageConfig.type === "gcs" && !gcpConfig.storageBucket) {
    errors.push("GCS storage configured but missing bucket name");
  }

  if (errors.length > 0) {
    throw new Error(
      `Configuration validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }
};

// Run validation
validateConfig();

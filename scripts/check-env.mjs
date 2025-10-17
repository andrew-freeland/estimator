#!/usr/bin/env node

/**
 * Environment Sanity Check Script for Estimator Assistant MCP
 *
 * This script validates all required environment variables before deployment.
 * It checks for proper formats, required values, and provides clear feedback.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
};

// Helper functions
const colorize = (text, color) => `${colors[color]}${text}${colors.reset}`;
const success = (text) => colorize(`✅ ${text}`, "green");
const error = (text) => colorize(`❌ ${text}`, "red");
const warning = (text) => colorize(`🟡 ${text}`, "yellow");
const info = (text) => colorize(`ℹ️  ${text}`, "blue");

// Load environment variables from .env.local
function loadEnvFile() {
  const envFiles = [".env.local", ".env", ".env.production"];

  for (const envFile of envFiles) {
    const envPath = join(projectRoot, envFile);
    if (existsSync(envPath)) {
      console.log(info(`Loading environment from: ${envFile}`));
      const envContent = readFileSync(envPath, "utf8");
      const envVars = {};

      envContent.split("\n").forEach((line) => {
        line = line.trim();
        if (line && !line.startsWith("#")) {
          const [key, ...valueParts] = line.split("=");
          if (key && valueParts.length > 0) {
            envVars[key.trim()] = valueParts.join("=").trim();
          }
        }
      });

      return envVars;
    }
  }

  console.log(warning("No .env file found, using process.env only"));
  return {};
}

// Validation rules for different types of environment variables
const validationRules = {
  // Required core variables
  required: [
    "DATABASE_URL",
    "NODE_ENV",
    "BETTER_AUTH_SECRET",
    "OPENAI_API_KEY",
    "EA_GCP_PROJECT_ID",
    "EA_GCS_BUCKET_NAME",
  ],

  // URL-type variables
  urlTypes: [
    "DATABASE_URL",
    "EA_DATABASE_URL",
    "BASE_URL",
    "BETTER_AUTH_URL",
    "TEST_DATABASE_URL",
    "REDIS_URL",
  ],

  // Key-type variables with specific formats
  keyTypes: {
    OPENAI_API_KEY: { prefix: "sk-", minLength: 20 },
    BETTER_AUTH_SECRET: { minLength: 32 },
    EA_GOOGLE_CLIENT_ID: { minLength: 10 },
    EA_GOOGLE_CLIENT_SECRET: { minLength: 10 },
    EA_GOOGLE_API_KEY: { minLength: 10 },
    EA_GOOGLE_MAPS_API_KEY: { minLength: 10 },
  },

  // Enum-type variables
  enumTypes: {
    NODE_ENV: ["development", "production", "test"],
    FILE_STORAGE_TYPE: ["vercel-blob", "s3", "gcs"],
    LOG_LEVEL: ["error", "warn", "info", "debug"],
  },

  // Numeric variables
  numericTypes: [
    "MAX_FILE_SIZE",
    "MAX_CONCURRENT_EMBEDDINGS",
    "EMBEDDING_BATCH_SIZE",
  ],
};

// Validation functions
function validateUrl(value, varName) {
  if (!value) return { valid: false, error: "empty value" };

  try {
    const url = new URL(value);
    if (
      varName.includes("DATABASE") &&
      !["postgresql:", "postgres:"].includes(url.protocol)
    ) {
      return {
        valid: false,
        error: "must start with postgresql:// or postgres://",
      };
    }
    if (
      varName.includes("AUTH_URL") &&
      !["http:", "https:"].includes(url.protocol)
    ) {
      return { valid: false, error: "must start with http:// or https://" };
    }
    return { valid: true };
  } catch (_e) {
    return { valid: false, error: "invalid URL format" };
  }
}

function validateKey(value, _varName, rules) {
  if (!value) return { valid: false, error: "empty value" };

  if (rules.prefix && !value.startsWith(rules.prefix)) {
    return { valid: false, error: `must start with "${rules.prefix}"` };
  }

  if (rules.minLength && value.length < rules.minLength) {
    return {
      valid: false,
      error: `must be at least ${rules.minLength} characters`,
    };
  }

  return { valid: true };
}

function validateEnum(value, _varName, allowedValues) {
  if (!value) return { valid: false, error: "empty value" };

  if (!allowedValues.includes(value)) {
    return {
      valid: false,
      error: `must be one of: ${allowedValues.join(", ")}`,
    };
  }

  return { valid: true };
}

function validateNumeric(value, _varName) {
  if (!value) return { valid: false, error: "empty value" };

  const num = Number(value);
  if (isNaN(num) || num <= 0) {
    return { valid: false, error: "must be a positive number" };
  }

  return { valid: true };
}

function checkInterpolation(value) {
  if (!value) return false;

  // Check for common interpolation patterns
  const interpolationPatterns = [
    /\$\{([^}]+)\}/g, // ${VAR}
    /\$\(([^)]+)\)/g, // $(VAR)
    /\$\{([^}]+)\}/g, // ${VAR}
  ];

  for (const pattern of interpolationPatterns) {
    if (pattern.test(value)) {
      return true;
    }
  }

  return false;
}

// Main validation function
function validateEnvironment() {
  console.log(colorize("\n🧠 Environment Sanity Check Results", "bright"));
  console.log(colorize("─".repeat(50), "cyan"));

  const envVars = { ...process.env, ...loadEnvFile() };
  const results = [];
  let _hasErrors = false;
  let _hasWarnings = false;

  // Check all required variables
  for (const varName of validationRules.required) {
    const value = envVars[varName];
    const result = { name: varName, value, status: "unknown", error: null };

    if (!value) {
      result.status = "missing";
      result.error = "required variable not set";
      _hasErrors = true;
    } else if (checkInterpolation(value)) {
      result.status = "interpolation";
      result.error = "contains interpolation that needs to be resolved";
      _hasWarnings = true;
    } else {
      result.status = "valid";
    }

    results.push(result);
  }

  // Check URL-type variables
  for (const varName of validationRules.urlTypes) {
    const value = envVars[varName];
    if (value) {
      const validation = validateUrl(value, varName);
      const existingResult = results.find((r) => r.name === varName);

      if (existingResult) {
        if (validation.valid) {
          existingResult.status = "valid";
          existingResult.error = null;
        } else {
          existingResult.status = "invalid";
          existingResult.error = validation.error;
          _hasErrors = true;
        }
      } else {
        results.push({
          name: varName,
          value,
          status: validation.valid ? "valid" : "invalid",
          error: validation.valid ? null : validation.error,
        });
        if (!validation.valid) _hasErrors = true;
      }
    }
  }

  // Check key-type variables
  for (const [varName, rules] of Object.entries(validationRules.keyTypes)) {
    const value = envVars[varName];
    if (value) {
      const validation = validateKey(value, varName, rules);
      const existingResult = results.find((r) => r.name === varName);

      if (existingResult) {
        if (validation.valid) {
          existingResult.status = "valid";
          existingResult.error = null;
        } else {
          existingResult.status = "invalid";
          existingResult.error = validation.error;
          _hasErrors = true;
        }
      } else {
        results.push({
          name: varName,
          value,
          status: validation.valid ? "valid" : "invalid",
          error: validation.valid ? null : validation.error,
        });
        if (!validation.valid) _hasErrors = true;
      }
    }
  }

  // Check enum-type variables
  for (const [varName, allowedValues] of Object.entries(
    validationRules.enumTypes,
  )) {
    const value = envVars[varName];
    if (value) {
      const validation = validateEnum(value, varName, allowedValues);
      const existingResult = results.find((r) => r.name === varName);

      if (existingResult) {
        if (validation.valid) {
          existingResult.status = "valid";
          existingResult.error = null;
        } else {
          existingResult.status = "invalid";
          existingResult.error = validation.error;
          _hasErrors = true;
        }
      } else {
        results.push({
          name: varName,
          value,
          status: validation.valid ? "valid" : "invalid",
          error: validation.valid ? null : validation.error,
        });
        if (!validation.valid) _hasErrors = true;
      }
    }
  }

  // Check numeric variables
  for (const varName of validationRules.numericTypes) {
    const value = envVars[varName];
    if (value) {
      const validation = validateNumeric(value, varName);
      results.push({
        name: varName,
        value,
        status: validation.valid ? "valid" : "invalid",
        error: validation.valid ? null : validation.error,
      });
      if (!validation.valid) _hasErrors = true;
    }
  }

  // Display results
  results.forEach((result) => {
    const displayValue = result.value
      ? result.value.length > 50
        ? result.value.substring(0, 47) + "..."
        : result.value
      : "not set";

    const paddedName = result.name.padEnd(25, ".");

    switch (result.status) {
      case "valid":
        console.log(success(`${paddedName} ${displayValue}`));
        break;
      case "missing":
        console.log(error(`${paddedName} missing: ${result.error}`));
        break;
      case "invalid":
        console.log(error(`${paddedName} invalid: ${result.error}`));
        break;
      case "interpolation":
        console.log(warning(`${paddedName} ${displayValue} (${result.error})`));
        break;
      default:
        console.log(info(`${paddedName} ${displayValue}`));
    }
  });

  console.log(colorize("─".repeat(50), "cyan"));

  // Summary
  const validCount = results.filter((r) => r.status === "valid").length;
  const errorCount = results.filter(
    (r) => r.status === "missing" || r.status === "invalid",
  ).length;
  const warningCount = results.filter(
    (r) => r.status === "interpolation",
  ).length;

  if (errorCount === 0 && warningCount === 0) {
    console.log(success(`Summary: All ${validCount} variables are valid! 🎉`));
    console.log(colorize("\n✅ Environment is ready for deployment!", "green"));
    return 0;
  } else {
    console.log(
      warning(
        `Summary: ${errorCount} invalid, ${warningCount} warnings, ${validCount} valid`,
      ),
    );

    if (errorCount > 0) {
      console.log(
        error("\n❌ Please fix the invalid variables before deploying."),
      );
    }

    if (warningCount > 0) {
      console.log(
        warning(
          "\n🟡 Consider resolving interpolation warnings for production.",
        ),
      );
    }

    return 1;
  }
}

// Run the validation
try {
  const exitCode = validateEnvironment();
  process.exit(exitCode);
} catch (error) {
  console.error(error("Fatal error during validation:"), error.message);
  process.exit(1);
}

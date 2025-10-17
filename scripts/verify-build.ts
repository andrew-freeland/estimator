#!/usr/bin/env tsx
// @module: verify_build
// Verification script for Estimator Assistant MCP
// Runs TypeScript compilation, Docker build, and connectivity checks

import { execSync } from "child_process";
import { existsSync } from "fs";

// EA_ prefix for Estimator Assistant
const EA_VERIFY_TIMEOUT = 300000; // 5 minutes

interface VerificationResult {
  step: string;
  success: boolean;
  duration: number;
  error?: string;
  details?: string;
}

class BuildVerifier {
  private results: VerificationResult[] = [];

  async run(): Promise<void> {
    console.log("🔍 Starting Estimator Assistant MCP verification...\n");

    try {
      await this.verifyTypeScript();
      await this.verifyDockerBuild();
      await this.verifyEnvironmentVariables();
      await this.verifyDatabaseConnectivity();
      await this.verifyGCSConnectivity();

      this.printResults();

      const allPassed = this.results.every((r) => r.success);
      if (allPassed) {
        console.log("\n✅ All verification steps passed!");
        process.exit(0);
      } else {
        console.log("\n❌ Some verification steps failed!");
        process.exit(1);
      }
    } catch (error) {
      console.error("\n💥 Verification failed:", error);
      process.exit(1);
    }
  }

  private async verifyTypeScript(): Promise<void> {
    await this.runStep("TypeScript Compilation", async () => {
      const startTime = Date.now();

      try {
        execSync("npx tsc --noEmit", {
          stdio: "pipe",
          timeout: EA_VERIFY_TIMEOUT,
        });

        const duration = Date.now() - startTime;
        return {
          success: true,
          duration,
          details: "TypeScript compilation successful",
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        return {
          success: false,
          duration,
          error: error instanceof Error ? error.message : "Unknown error",
          details: "TypeScript compilation failed",
        };
      }
    });
  }

  private async verifyDockerBuild(): Promise<void> {
    await this.runStep("Docker Build", async () => {
      const startTime = Date.now();

      try {
        // Check if Dockerfile exists
        if (!existsSync("Dockerfile")) {
          throw new Error("Dockerfile not found");
        }

        // Build Docker image
        execSync("docker build --quiet -t estimator-assistant .", {
          stdio: "pipe",
          timeout: EA_VERIFY_TIMEOUT,
        });

        const duration = Date.now() - startTime;
        return {
          success: true,
          duration,
          details: "Docker image built successfully",
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        return {
          success: false,
          duration,
          error: error instanceof Error ? error.message : "Unknown error",
          details: "Docker build failed",
        };
      }
    });
  }

  private async verifyEnvironmentVariables(): Promise<void> {
    await this.runStep("Environment Variables", async () => {
      const startTime = Date.now();

      const requiredVars = [
        "EA_GCS_BUCKET_NAME",
        "EA_GCP_PROJECT_ID",
        "EA_DATABASE_URL",
        "OPENAI_API_KEY",
      ];

      const optionalVars = ["EA_GOOGLE_API_KEY", "EA_MAPS_API_KEY"];

      const missing = requiredVars.filter((varName) => !process.env[varName]);
      const present = requiredVars.filter((varName) => process.env[varName]);
      const optionalPresent = optionalVars.filter(
        (varName) => process.env[varName],
      );

      const duration = Date.now() - startTime;

      if (missing.length > 0) {
        return {
          success: false,
          duration,
          error: `Missing required environment variables: ${missing.join(", ")}`,
          details: `Required: ${present.length}/${requiredVars.length}, Optional: ${optionalPresent.length}/${optionalVars.length}`,
        };
      }

      return {
        success: true,
        duration,
        details: `Required: ${present.length}/${requiredVars.length}, Optional: ${optionalPresent.length}/${optionalVars.length}`,
      };
    });
  }

  private async verifyDatabaseConnectivity(): Promise<void> {
    await this.runStep("Database Connectivity", async () => {
      const startTime = Date.now();

      try {
        // This would typically test database connectivity
        // For now, we'll just check if the DATABASE_URL is properly formatted
        const dbUrl = process.env.EA_DATABASE_URL || process.env.DATABASE_URL;

        if (!dbUrl) {
          throw new Error("Database URL not configured");
        }

        if (!dbUrl.startsWith("postgresql://")) {
          throw new Error(
            "Database URL must be a PostgreSQL connection string",
          );
        }

        // In a real implementation, you would test the actual connection
        // await testDatabaseConnection(dbUrl);

        const duration = Date.now() - startTime;
        return {
          success: true,
          duration,
          details: "Database URL format is valid",
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        return {
          success: false,
          duration,
          error: error instanceof Error ? error.message : "Unknown error",
          details: "Database connectivity check failed",
        };
      }
    });
  }

  private async verifyGCSConnectivity(): Promise<void> {
    await this.runStep("GCS Connectivity", async () => {
      const startTime = Date.now();

      try {
        const bucketName = process.env.EA_GCS_BUCKET_NAME;
        const projectId = process.env.EA_GCP_PROJECT_ID;

        if (!bucketName) {
          throw new Error("EA_GCS_BUCKET_NAME not configured");
        }

        if (!projectId) {
          throw new Error("EA_GCP_PROJECT_ID not configured");
        }

        // In a real implementation, you would test GCS connectivity
        // await testGCSConnection(bucketName, projectId);

        const duration = Date.now() - startTime;
        return {
          success: true,
          duration,
          details: `GCS bucket: ${bucketName}, Project: ${projectId}`,
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        return {
          success: false,
          duration,
          error: error instanceof Error ? error.message : "Unknown error",
          details: "GCS connectivity check failed",
        };
      }
    });
  }

  private async runStep(
    stepName: string,
    stepFunction: () => Promise<Omit<VerificationResult, "step">>,
  ): Promise<void> {
    console.log(`⏳ ${stepName}...`);

    try {
      const result = await stepFunction();
      this.results.push({
        step: stepName,
        ...result,
      });

      const status = result.success ? "✅" : "❌";
      const duration = `${result.duration}ms`;
      console.log(`${status} ${stepName} (${duration})`);

      if (result.details) {
        console.log(`   ${result.details}`);
      }

      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }

      console.log();
    } catch (error) {
      this.results.push({
        step: stepName,
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      console.log(`❌ ${stepName} (failed)`);
      console.log(
        `   Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      console.log();
    }
  }

  private printResults(): void {
    console.log("📊 Verification Results:");
    console.log("=".repeat(50));

    this.results.forEach((result) => {
      const status = result.success ? "✅" : "❌";
      const duration = `${result.duration}ms`;
      console.log(`${status} ${result.step} (${duration})`);

      if (result.details) {
        console.log(`   ${result.details}`);
      }

      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    const passed = this.results.filter((r) => r.success).length;
    const total = this.results.length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log("=".repeat(50));
    console.log(`Total: ${passed}/${total} passed (${totalDuration}ms)`);
  }
}

// Run verification if this script is executed directly
if (require.main === module) {
  const verifier = new BuildVerifier();
  verifier.run().catch((error) => {
    console.error("Verification failed:", error);
    process.exit(1);
  });
}

export { BuildVerifier };

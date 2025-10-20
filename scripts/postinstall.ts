import { exec } from "child_process";
import {
  IS_VERCEL_ENV,
  IS_DOCKER_ENV,
  FILE_BASED_MCP_CONFIG,
} from "../src/lib/const";
import { promisify } from "util";
import "load-env";
const execPromise = promisify(exec);

async function runCommand(command: string, description: string) {
  console.log(`Starting: ${description}`);
  try {
    const { stdout, stderr } = await execPromise(command, {
      cwd: process.cwd(),
      env: process.env,
    });

    console.log(`${description} output:`);
    console.log(stdout);

    if (stderr) {
      console.error(`${description} stderr:`);
      console.error(stderr);
    }
    console.log(`${description} finished successfully.`);
  } catch (error: any) {
    console.error(`${description} error:`, error);
    // Only exit on local builds, not on Vercel
    if (!IS_VERCEL_ENV) {
      process.exit(1);
    }
  }
}

async function main() {
  if (IS_VERCEL_ENV) {
    if (FILE_BASED_MCP_CONFIG) {
      // On Vercel, do not exit the build process — print an actionable error and continue.
      console.error(
        "File based MCP config is not supported on Vercel. Please unset FILE_BASED_MCP_CONFIG in Vercel project settings.",
      );
      // Avoid process.exit to prevent build queue starvation or abrupt failure in certain Vercel outages.
      return;
    }
    console.log(
      "Running on Vercel, skipping database migration (will be handled at runtime).",
    );
    console.log(
      "Vercel build environment detected - no database operations needed.",
    );
    // Skip database migration on Vercel - it will be handled at runtime when the app starts
  } else if (IS_DOCKER_ENV) {
    if (FILE_BASED_MCP_CONFIG) {
      console.error(
        "File based MCP config is not supported in Docker. Exiting.",
      );
      // In Docker/local builds, fail early so developers notice
      process.exit(1);
    }
  } else {
    console.log(
      "Running in a normal environment, performing initial environment setup.",
    );
    await runCommand("pnpm initial:env", "Initial environment setup");
    await runCommand(
      "pnpm openai-compatiable:init",
      "Initial openAI compatiable config setup",
    );
  }
}

main().catch((err) => {
  console.error("Postinstall script failed:", err);
  // Only fatal if running locally in non-Vercel context
  if (!IS_VERCEL_ENV) process.exit(1);
});

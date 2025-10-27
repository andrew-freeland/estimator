// @module: debug_api
// Debug endpoint to help diagnose 500 errors
// Provides detailed information about system status

import { NextRequest, NextResponse } from "next/server";
import { env, validateEnv } from "@/lib/env";
import { customModelProvider } from "@/lib/ai/models";
import logger from "@/lib/logger";

export async function GET(_request: NextRequest) {
  const debugInfo = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    vercel: {
      isVercel: !!process.env.VERCEL,
      env: process.env.VERCEL_ENV,
      url: process.env.VERCEL_URL,
    },
    checks: {
      environment: false,
      models: false,
      openai: false,
    },
    errors: [] as string[],
    env: {
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasAuthSecret: !!process.env.BETTER_AUTH_SECRET,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      authDisabled: process.env.AUTH_DISABLED === "true",
    },
  };

  try {
    // Check environment validation
    try {
      validateEnv();
      debugInfo.checks.environment = true;
    } catch (envError) {
      debugInfo.errors.push(
        `Environment validation failed: ${envError.message}`,
      );
    }

    // Check model provider
    try {
      const _model = await customModelProvider.getModel({
        provider: "openai",
        model: env.EA_EXPLAINER_MODEL || "gpt-4o",
      });
      debugInfo.checks.models = true;
    } catch (modelError) {
      debugInfo.errors.push(`Model loading failed: ${modelError.message}`);
    }

    // Check OpenAI API (basic connectivity)
    try {
      // Simple OpenAI API check
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      });
      if (response.ok) {
        debugInfo.checks.openai = true;
      } else {
        debugInfo.errors.push(`OpenAI API check failed: ${response.status}`);
      }
    } catch (openaiError) {
      debugInfo.errors.push(`OpenAI API error: ${openaiError.message}`);
    }

    return NextResponse.json({
      status: "ok",
      ...debugInfo,
    });
  } catch (error) {
    logger.error("Debug endpoint error:", error);
    return NextResponse.json(
      {
        status: "error",
        error: error.message,
        ...debugInfo,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Invalid messages format" },
        { status: 400 },
      );
    }

    // Test the orchestrator with a simple message
    const testRequest = {
      messages: [
        {
          role: "user" as const,
          content: "Hello, this is a test message",
        },
      ],
      threadId: "debug-test",
      userId: "debug-user",
      sessionId: "debug-session",
      context: {},
    };

    // Import orchestrator dynamically to avoid circular imports
    const { orchestrator } = await import("@/lib/orchestrator");
    const result = await orchestrator(testRequest);

    return NextResponse.json({
      status: "ok",
      message: "Orchestrator test completed",
      responseStatus: result.status,
    });
  } catch (error) {
    logger.error("Debug POST error:", error);
    return NextResponse.json(
      {
        status: "error",
        error: error.message,
        stack: error.stack,
      },
      { status: 500 },
    );
  }
}

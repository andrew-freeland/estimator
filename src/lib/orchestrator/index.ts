// @module: orchestrator
// Unified Orchestrator for Estimator Assistant MVP
// Central entry point for all AI chat interactions

import "server-only";
import { streamText } from "ai";
import { customModelProvider } from "@/lib/ai/models";
import { env, validateEnvGraceful } from "@/lib/env";
import logger from "@/lib/logger";
import { getSystemPrompt } from "./systemPrompt";
import type { OrchestratorRequest, AgentType } from "./types";
import { ValidationError } from "./types";

// Agent registry for future expansion
const agentRegistry = {
  estimator: "estimator", // Default active agent
  // Future agents can be added here:
  // confidence: 'confidence',
  // profitability: 'profitability',
  // contract: 'contract',
} as const;

// AgentType is now imported from types.ts

/**
 * Main orchestrator function - routes messages to appropriate agents
 */
export async function orchestrator(
  request: OrchestratorRequest,
): Promise<Response> {
  try {
    // Validate environment with better error handling
    try {
      validateEnv();
    } catch (envError) {
      logger.error("Environment validation failed:", envError);
      return new Response(
        JSON.stringify({
          error: "Configuration error",
          details: envError.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Validate request with detailed error messages
    try {
      validateRequest(request);
    } catch (validationError) {
      logger.error("Request validation failed:", validationError);
      return new Response(
        JSON.stringify({
          error: "Invalid request",
          details: validationError.message,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { messages, threadId, userId, sessionId, context } = request;

    logger.info(`Processing orchestrator request for thread ${threadId}`);

    // For MVP, route everything to estimator agent
    const agentType: AgentType = "estimator";

    // Get the system prompt for the selected agent with error handling
    let systemPrompt;
    try {
      systemPrompt = getSystemPrompt(agentType, {
        userId,
        sessionId,
        context,
      });
    } catch (promptError) {
      logger.error("System prompt generation failed:", promptError);
      return new Response(
        JSON.stringify({
          error: "Prompt generation failed",
          details: promptError.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Get the AI model with error handling
    let model;
    try {
      model = await customModelProvider.getModel({
        provider: "openai",
        model: env.EA_EXPLAINER_MODEL, // Uses "gpt-4o" from env
      });
    } catch (modelError) {
      logger.error("Model loading failed:", modelError);
      return new Response(
        JSON.stringify({
          error: "Model unavailable",
          details: "Failed to load AI model",
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Process the message through the AI model with error handling
    try {
      const result = await streamText({
        model,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          ...messages,
        ],
      });

      return result.toTextStreamResponse();
    } catch (streamError) {
      logger.error("Streaming failed:", streamError);
      return new Response(
        JSON.stringify({
          error: "AI processing failed",
          details: streamError.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    logger.error("Unexpected error in orchestrator:", error);

    if (error instanceof ValidationError) {
      return new Response(
        JSON.stringify({
          error: error.message,
          statusCode: error.statusCode,
        }),
        {
          status: error.statusCode,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

/**
 * Validate orchestrator request
 */
function validateRequest(request: OrchestratorRequest): void {
  if (
    !request.messages ||
    !Array.isArray(request.messages) ||
    request.messages.length === 0
  ) {
    throw new ValidationError(
      "Invalid messages format - messages must be a non-empty array",
    );
  }

  const lastMessage = request.messages[request.messages.length - 1];
  if (!lastMessage || lastMessage.role !== "user") {
    throw new ValidationError("Last message must be from user");
  }

  if (!lastMessage.content || lastMessage.content.trim().length === 0) {
    throw new ValidationError("Message content cannot be empty");
  }

  // Validate message structure
  for (const message of request.messages) {
    if (!message.role || !["user", "assistant"].includes(message.role)) {
      throw new ValidationError(
        "Invalid message role - must be 'user' or 'assistant'",
      );
    }
    if (!message.content || typeof message.content !== "string") {
      throw new ValidationError(
        "Invalid message content - must be a non-empty string",
      );
    }
  }
}

/**
 * Route message to specific agent (for future expansion)
 */
export async function routeToAgent(
  _agentType: AgentType,
  request: OrchestratorRequest,
): Promise<Response> {
  // For MVP, all agents route to the same estimator logic
  // Future: implement specific agent logic here
  return orchestrator(request);
}

/**
 * Get available agents (for future expansion)
 */
export function getAvailableAgents(): AgentType[] {
  return Object.keys(agentRegistry) as AgentType[];
}

/**
 * Check if agent is available
 */
export function isAgentAvailable(agentType: string): agentType is AgentType {
  return agentType in agentRegistry;
}

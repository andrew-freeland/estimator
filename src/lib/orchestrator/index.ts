// @module: orchestrator
// Unified Orchestrator for Estimator Assistant MVP
// Central entry point for all AI chat interactions

import "server-only";
import { streamText } from "ai";
import { customModelProvider } from "@/lib/ai/models";
import { env, validateEnv } from "@/lib/env";
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
    // Validate environment
    validateEnv();

    // Validate request
    validateRequest(request);

    const { messages, threadId, userId, sessionId, context } = request;

    logger.info(`Processing orchestrator request for thread ${threadId}`);

    // For MVP, route everything to estimator agent
    const agentType: AgentType = "estimator";

    // Get the system prompt for the selected agent
    const systemPrompt = getSystemPrompt(agentType, {
      userId,
      sessionId,
      context,
    });

    // Get the AI model
    const model = await customModelProvider.getModel({
      provider: "openai",
      model: env.EA_EXPLAINER_MODEL, // Uses "gpt-4o" from env
    });

    // Process the message through the AI model
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
  } catch (error) {
    logger.error("Error in orchestrator:", error);

    if (error instanceof ValidationError) {
      return new Response(error.message, { status: error.statusCode });
    }

    return new Response("Internal server error", { status: 500 });
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

// @module: estimator_chat_api
// API endpoint for Estimator Assistant chat
// Now uses the unified orchestrator for all AI interactions

import { orchestrator } from "@/lib/orchestrator";
import logger from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const { messages, threadId, userId, sessionId, context } =
      await request.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response("Invalid messages format", { status: 400 });
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      return new Response("Last message must be from user", { status: 400 });
    }

    logger.info(`Processing estimator chat request for thread ${threadId}`);

    // Route through the unified orchestrator
    return await orchestrator({
      messages,
      threadId,
      userId,
      sessionId,
      context,
    });
  } catch (error) {
    logger.error("Error in estimator chat API:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

// ============================================================================
// TEMPORARILY DISABLED: Complex Agent Processing Functions
// ============================================================================
//
// The following functions have been commented out to enable minimal deployment
// without database dependencies. They contain the full agent system logic.
//
// TO RESTORE FULL FUNCTIONALITY:
// 1. Set up database (see DEPLOYMENT_STATUS.md)
// 2. Uncomment the imports at the top of this file
// 3. Uncomment all functions below
// 4. Replace the simplified streamText call with processEstimatorMessage()
//
// DISABLED FUNCTIONS:
// - processEstimatorMessage() - Main message routing logic
// - handleRatesRequest() - Labor rates and material costs
// - handleEstimateRequest() - Detailed estimate breakdowns
// - handleFileRequest() - Document analysis
// - handleGeneralRequest() - General assistance with context
// - extractLocation() - Location parsing helper
// - extractCategories() - Category parsing helper
//
// ============================================================================

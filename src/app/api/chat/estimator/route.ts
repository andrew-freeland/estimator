// @module: estimator_chat_api
// API endpoint for Estimator Assistant chat
//
// ⚠️  TEMPORARILY SIMPLIFIED FOR DEPLOYMENT ⚠️
//
// This route has been simplified to work without database dependencies.
// See DEPLOYMENT_STATUS.md for details on restoring full functionality.
//
// TEMPORARILY DISABLED:
// - ratesAgent (labor rates, material costs)
// - explainerAgent (detailed estimate breakdowns)
// - vectorStoreService (document search and analysis)
// - Complex message processing and routing
//
// TO RESTORE: Uncomment imports below and restore processEstimatorMessage function

import { streamText } from "ai";
// TODO: Re-enable these imports after database setup
// import { ratesAgent } from "@/agents/rates_agent";
// import { explainerAgent } from "@/agents/explainer_agent";
// import { vectorStoreService } from "@/vectorstore";
import logger from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const { messages, threadId } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response("Invalid messages format", { status: 400 });
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      return new Response("Last message must be from user", { status: 400 });
    }

    logger.info(`Processing estimator chat request for thread ${threadId}`);

    // SIMPLIFIED: Direct LLM response without agent processing
    // TODO: Replace with processEstimatorMessage() after restoring agent system
    return streamText({
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: process.env.OPENAI_API_KEY,
      },
      messages: [
        {
          role: "system",
          content:
            "You are a construction estimator assistant. Provide helpful, accurate responses about construction costs, estimates, and project planning. Keep responses concise and practical.",
        },
        ...messages,
      ],
    }).toDataStreamResponse();
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

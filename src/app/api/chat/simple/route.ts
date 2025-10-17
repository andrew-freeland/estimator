// @module: simple_chat_api
// Minimal chat API for testing deployment
// Just connects to OpenAI without complex agents

import { streamText } from "ai";
import { aiConfig } from "@/lib/config";

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response("Invalid messages format", { status: 400 });
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      return new Response("Last message must be from user", { status: 400 });
    }

    // Simple streaming response - no complex agents, no database
    return streamText({
      model: {
        provider: "openai",
        modelId: aiConfig.explainerModel, // Uses "gpt-5" from config
      },
      apiKey: aiConfig.openaiApiKey,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful construction estimator assistant. Provide helpful responses about construction costs, estimates, and project planning.",
        },
        ...messages,
      ],
    }).toDataStreamResponse();
  } catch (error) {
    console.error("Error in simple chat API:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

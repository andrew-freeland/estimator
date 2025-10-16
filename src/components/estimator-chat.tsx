// @module: estimator_chat
// Estimator Assistant Chat Interface using assistant-ui
// Replaces the existing chat interface with modular, production-grade streaming

"use client";

import { useChat } from "ai/react";
import { AssistantRuntimeProvider, Thread } from "@assistant-ui/react";
import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ingestionAgent } from "@/agents/ingestion_agent";
import { ratesAgent } from "@/agents/rates_agent";
import { explainerAgent } from "@/agents/explainer_agent";
import { vectorStoreService } from "@/vectorstore";
import { config } from "@/lib/config";

// Types for estimator-specific chat
interface EstimatorChatProps {
  threadId?: string;
  initialMessages?: any[];
  className?: string;
}

interface EstimatorMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: Array<{
    name: string;
    type: string;
    url: string;
    size: number;
  }>;
  metadata?: {
    clientId?: string;
    jobId?: string;
    estimateData?: any;
    confidence?: number;
  };
}

// Custom runtime for Estimator Assistant
const createEstimatorRuntime = () => {
  return {
    // Handle message submission
    async submitMessage(message: EstimatorMessage) {
      try {
        // Process attachments if any
        if (message.attachments && message.attachments.length > 0) {
          await this.processAttachments(message.attachments, message.metadata);
        }

        // Route to appropriate agent based on message content
        const response = await this.routeToAgent(message);

        return {
          id: `msg_${Date.now()}`,
          role: "assistant" as const,
          content: response.content,
          metadata: response.metadata,
        };
      } catch (error) {
        console.error("Error processing message:", error);
        return {
          id: `error_${Date.now()}`,
          role: "assistant" as const,
          content:
            "I apologize, but I encountered an error processing your request. Please try again.",
          metadata: { error: true },
        };
      }
    },

    // Process file attachments
    async processAttachments(attachments: any[], metadata: any) {
      for (const attachment of attachments) {
        try {
          // Download and process the file
          const response = await fetch(attachment.url);
          const buffer = await response.arrayBuffer();

          // Use ingestion agent to process the file
          await ingestionAgent.ingest({
            clientId: metadata.clientId || "default",
            jobId: metadata.jobId,
            sourcePath: attachment.name,
            sourceType: this.getSourceType(attachment.type),
            fileBuffer: Buffer.from(buffer),
            mimeType: attachment.type,
            metadata: {
              originalName: attachment.name,
              size: attachment.size,
              uploadedAt: new Date().toISOString(),
            },
          });
        } catch (error) {
          console.error(
            `Error processing attachment ${attachment.name}:`,
            error,
          );
        }
      }
    },

    // Get source type from MIME type
    getSourceType(mimeType: string): "file" | "transcript" | "text" {
      if (mimeType.startsWith("audio/")) return "transcript";
      if (mimeType.startsWith("text/")) return "text";
      return "file";
    },

    // Route message to appropriate agent
    async routeToAgent(message: EstimatorMessage) {
      const content = message.content.toLowerCase();

      // Check if this is a request for rates/costs
      if (
        content.includes("rate") ||
        content.includes("cost") ||
        content.includes("price")
      ) {
        return this.handleRatesRequest(message);
      }

      // Check if this is a request for estimate explanation
      if (
        content.includes("explain") ||
        content.includes("estimate") ||
        content.includes("breakdown")
      ) {
        return this.handleEstimateRequest(message);
      }

      // Default to general assistance
      return this.handleGeneralRequest(message);
    },

    // Handle rates/cost requests
    async handleRatesRequest(message: EstimatorMessage) {
      const ratesData = await ratesAgent.getRates({
        clientId: message.metadata?.clientId || "default",
        jobId: message.metadata?.jobId,
        location: this.extractLocation(message.content),
        categories: this.extractCategories(message.content),
      });

      if (ratesData.success) {
        return {
          content: this.formatRatesResponse(ratesData.data),
          metadata: {
            type: "rates",
            data: ratesData.data,
            confidence: 0.9,
          },
        };
      } else {
        return {
          content:
            "I encountered an error retrieving rate information. Please try again or provide more specific details.",
          metadata: { error: true },
        };
      }
    },

    // Handle estimate explanation requests
    async handleEstimateRequest(message: EstimatorMessage) {
      const estimateData = await explainerAgent.explainEstimate({
        clientId: message.metadata?.clientId || "default",
        jobId: message.metadata?.jobId,
        projectDescription: message.content,
        location: this.extractLocation(message.content),
      });

      if (estimateData.success) {
        return {
          content:
            estimateData.data?.narrative || "Estimate generated successfully.",
          metadata: {
            type: "estimate",
            data: estimateData.data,
            confidence: estimateData.data?.breakdown?.overallConfidence || 0.8,
          },
        };
      } else {
        return {
          content:
            "I encountered an error generating the estimate. Please provide more details about your project.",
          metadata: { error: true },
        };
      }
    },

    // Handle general requests
    async handleGeneralRequest(message: EstimatorMessage) {
      // Search for relevant information in vector store
      const searchResults = await vectorStoreService.search({
        query: message.content,
        clientId: message.metadata?.clientId || "default",
        jobId: message.metadata?.jobId,
        limit: 5,
      });

      if (searchResults.length > 0) {
        const relevantContent = searchResults
          .map((result) => result.content)
          .join("\n\n");

        return {
          content: `Based on your project data, here's what I found:\n\n${relevantContent}\n\nWould you like me to help you with a specific estimate or cost breakdown?`,
          metadata: {
            type: "general",
            sources: searchResults.map((r) => r.source),
            confidence: 0.7,
          },
        };
      } else {
        return {
          content:
            "I'd be happy to help you with construction estimates! Please share your project details, upload any relevant documents, or ask me about specific costs, materials, or timelines.",
          metadata: {
            type: "general",
            confidence: 0.5,
          },
        };
      }
    },

    // Extract location from message content
    extractLocation(content: string): string | undefined {
      // Simple location extraction - could be enhanced with NLP
      const locationMatch = content.match(
        /(?:in|at|near|location:?)\s+([^,.\n]+)/i,
      );
      return locationMatch ? locationMatch[1].trim() : undefined;
    },

    // Extract categories from message content
    extractCategories(content: string): string[] {
      const categories = [];
      if (content.includes("labor") || content.includes("worker"))
        categories.push("Labor");
      if (content.includes("material") || content.includes("supply"))
        categories.push("Materials");
      if (content.includes("equipment") || content.includes("machine"))
        categories.push("Equipment");
      if (content.includes("overhead") || content.includes("admin"))
        categories.push("Overhead");
      return categories;
    },

    // Format rates response
    formatRatesResponse(data: any): string {
      let response = "Here's the rate information I found:\n\n";

      if (data.laborRates && data.laborRates.length > 0) {
        response += "**Labor Rates:**\n";
        data.laborRates.forEach((rate: any) => {
          response += `- ${rate.skill}: $${rate.hourlyRate}/hour\n`;
        });
        response += "\n";
      }

      if (data.materialCosts && data.materialCosts.length > 0) {
        response += "**Material Costs:**\n";
        data.materialCosts.forEach((cost: any) => {
          response += `- ${cost.item}: $${cost.unitPrice}/${cost.unit}\n`;
        });
        response += "\n";
      }

      if (data.locationModifiers) {
        response += `**Location Modifiers:**\n`;
        response += `- Total modifier: ${(data.locationModifiers.modifiers.total * 100).toFixed(1)}%\n`;
        response += `- Region: ${data.locationModifiers.region}\n\n`;
      }

      response +=
        "Would you like me to help you create a detailed estimate based on these rates?";

      return response;
    },
  };
};

export default function EstimatorChat({
  threadId,
  initialMessages = [],
  className,
}: EstimatorChatProps) {
  const _t = useTranslations();
  const runtime = useMemo(() => createEstimatorRuntime(), []);

  // Initialize chat with AI SDK
  const { input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: "/api/chat/estimator",
    initialMessages,
    body: {
      threadId,
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className={cn("flex flex-col h-full", className)}>
        <Thread
          className="flex-1 overflow-hidden"
          // Custom message rendering
          renderMessage={({ message }) => (
            <div
              className={cn(
                "p-4 rounded-lg mb-4",
                message.role === "user"
                  ? "bg-blue-50 ml-auto max-w-[80%]"
                  : "bg-gray-50 mr-auto max-w-[80%]",
              )}
            >
              <div className="font-medium text-sm mb-1">
                {message.role === "user" ? "You" : "Estimator Assistant"}
              </div>
              <div className="text-gray-800">{message.content}</div>
              {message.metadata && (
                <div className="mt-2 text-xs text-gray-500">
                  {message.metadata.confidence && (
                    <span>
                      Confidence:{" "}
                      {(message.metadata.confidence * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        />

        {/* Input area */}
        <div className="border-t p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about construction estimates, upload files, or request cost breakdowns..."
              className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "..." : "Send"}
            </button>
          </form>

          {error && (
            <div className="mt-2 text-sm text-red-600">
              Error: {error.message}
            </div>
          )}
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}

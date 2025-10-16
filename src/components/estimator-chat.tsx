// @module: estimator_chat
// Estimator Assistant Chat Interface using assistant-ui
// Replaces the existing chat interface with modular, production-grade streaming

"use client";

import { useChat } from "ai/react";
import { AssistantRuntimeProvider, Thread } from "@assistant-ui/react";
import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

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

          // Use API endpoint to process the file
          await fetch("/api/upload/voice", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              clientId: metadata.clientId || "default",
              jobId: metadata.jobId,
              sourcePath: attachment.name,
              sourceType: this.getSourceType(attachment.type),
              fileBuffer: Buffer.from(buffer).toString("base64"),
              mimeType: attachment.type,
              metadata: {
                originalName: attachment.name,
                size: attachment.size,
                uploadedAt: new Date().toISOString(),
              },
            }),
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

    // Route message to appropriate agent via API
    async routeToAgent(message: EstimatorMessage) {
      try {
        const response = await fetch("/api/chat/estimator", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [message],
            threadId: this.threadId,
          }),
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        return {
          content:
            data.content || "I'm sorry, I couldn't process your request.",
          metadata: data.metadata || {},
        };
      } catch (error) {
        console.error("Error routing to agent:", error);
        return {
          content:
            "I apologize, but I encountered an error processing your request. Please try again.",
          metadata: { error: true },
        };
      }
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

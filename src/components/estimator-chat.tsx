// @module: estimator_chat
// Estimator Assistant Chat Interface
// Simple chat interface for the estimator

"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { cn } from "@/lib/utils";

// Types for estimator-specific chat
interface EstimatorChatProps {
  threadId?: string;
  initialMessages?: any[];
  className?: string;
}

export default function EstimatorChat({
  threadId,
  initialMessages = [],
  className,
}: EstimatorChatProps) {
  // Local state for input management
  const [input, setInput] = useState("");

  // Initialize chat with AI SDK v2
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat/estimator",
      prepareSendMessagesRequest: ({ messages }) => ({
        body: {
          threadId,
          messages,
        },
      }),
    }),
    messages: initialMessages,
  });

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && status === "ready") {
      sendMessage({ text: input });
      setInput("");
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header */}
      <div className="border-b p-4 bg-card">
        <h1 className="text-xl font-semibold text-foreground">
          Estimator Assistant
        </h1>
        <p className="text-sm text-muted-foreground">
          AI-powered construction cost estimation
        </p>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="max-w-md">
              <h2 className="text-2xl font-bold text-foreground mb-4">
                Welcome to Estimator Assistant
              </h2>
              <p className="text-muted-foreground mb-6">
                Get detailed cost breakdowns for labor, materials, and equipment
                with confidence levels and assumptions.
              </p>
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() =>
                    setInput(
                      "What's the cost to build a 2000 sq ft house in Austin, TX?",
                    )
                  }
                  className="p-3 text-left border border-border rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="font-medium">🏠 House Construction</div>
                  <div className="text-sm text-muted-foreground">
                    Get estimates for residential projects
                  </div>
                </button>
                <button
                  onClick={() =>
                    setInput(
                      "Upload this blueprint and give me a material breakdown",
                    )
                  }
                  className="p-3 text-left border border-border rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="font-medium">📋 Document Analysis</div>
                  <div className="text-sm text-muted-foreground">
                    Analyze construction plans and specifications
                  </div>
                </button>
                <button
                  onClick={() =>
                    setInput(
                      "What are current labor rates for electricians in California?",
                    )
                  }
                  className="p-3 text-left border border-border rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="font-medium">💰 Market Rates</div>
                  <div className="text-sm text-muted-foreground">
                    Access current labor and material costs
                  </div>
                </button>
              </div>
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                "p-4 rounded-lg",
                message.role === "user"
                  ? "bg-primary/10 ml-auto max-w-[80%]"
                  : "bg-muted mr-auto max-w-[80%]",
              )}
            >
              <div className="font-medium text-sm mb-1">
                {message.role === "user" ? "You" : "Estimator Assistant"}
              </div>
              <div className="text-foreground">
                {message.parts.map((part, partIndex) =>
                  part.type === "text" ? (
                    <span key={partIndex}>{part.text}</span>
                  ) : null,
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <div className="border-t p-4 bg-card">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about construction estimates, upload files, or request cost breakdowns..."
            className="flex-1 px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground"
            disabled={status !== "ready"}
          />
          <button
            type="submit"
            disabled={!input.trim() || status !== "ready"}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "streaming" ? "Sending..." : "Send"}
          </button>
        </form>

        {error && (
          <div className="mt-2 text-sm text-destructive">
            Error: {error.message}
          </div>
        )}
      </div>
    </div>
  );
}

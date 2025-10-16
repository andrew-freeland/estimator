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
    <div className={cn("flex flex-col h-full", className)}>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={cn(
              "p-4 rounded-lg",
              message.role === "user"
                ? "bg-blue-50 ml-auto max-w-[80%]"
                : "bg-gray-50 mr-auto max-w-[80%]",
            )}
          >
            <div className="font-medium text-sm mb-1">
              {message.role === "user" ? "You" : "Estimator Assistant"}
            </div>
            <div className="text-gray-800">
              {message.parts.map((part, partIndex) =>
                part.type === "text" ? (
                  <span key={partIndex}>{part.text}</span>
                ) : null,
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about construction estimates, upload files, or request cost breakdowns..."
            className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={status !== "ready"}
          />
          <button
            type="submit"
            disabled={status !== "ready" || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "streaming" ? "..." : "Send"}
          </button>
        </form>

        {error && (
          <div className="mt-2 text-sm text-red-600">
            Error: {error.message}
          </div>
        )}
      </div>
    </div>
  );
}

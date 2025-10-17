// @module: simple_chat
// Minimal chat interface for testing deployment
// Just basic chat without complex features

"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { cn } from "@/lib/utils";

interface SimpleChatProps {
  className?: string;
}

export default function SimpleChat({ className }: SimpleChatProps) {
  const [input, setInput] = useState("");

  // Simple chat with minimal configuration
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat/simple",
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { messages },
      }),
    }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && status === "ready") {
      sendMessage({ text: input });
      setInput("");
    }
  };

  return (
    <div className={cn("flex flex-col h-full max-w-4xl mx-auto", className)}>
      {/* Header */}
      <div className="p-4 border-b bg-gray-50">
        <h1 className="text-xl font-semibold">Construction Estimator Chat</h1>
        <p className="text-sm text-gray-600">
          Ask me about construction costs, estimates, and project planning
        </p>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <p>Welcome! I&apos;m here to help with construction estimates.</p>
            <p className="text-sm mt-2">
              Try asking: &quot;What&apos;s the cost of framing a 2000 sq ft
              house?&quot;
            </p>
          </div>
        )}
        
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
      <div className="border-t p-4 bg-white">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
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

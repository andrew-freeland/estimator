// @module: orchestrator_integration_test
// Integration tests for the Estimator Assistant orchestrator

import { describe, it, expect, vi } from "vitest";
import { orchestrator } from "../index";
import type { OrchestratorRequest } from "../types";

// Mock all dependencies
vi.mock("@/lib/ai/models", () => ({
  customModelProvider: {
    getModel: vi.fn().mockResolvedValue({
      provider: "openai",
      model: "gpt-4o",
    }),
  },
}));

vi.mock("@/lib/env", () => ({
  validateEnv: vi.fn(),
  env: {
    EA_EXPLAINER_MODEL: "gpt-4o",
  },
}));

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("ai", () => ({
  streamText: vi.fn().mockResolvedValue({
    toTextStreamResponse: vi
      .fn()
      .mockReturnValue(new Response("test response")),
  }),
}));

describe("Orchestrator Integration", () => {
  it("should handle estimator chat requests with context", async () => {
    const request: OrchestratorRequest = {
      messages: [
        {
          role: "user",
          content:
            "What is the cost of building a 2000 sq ft house in San Francisco?",
        },
      ],
      threadId: "test-thread-123",
      userId: "test-user-456",
      sessionId: "test-session-789",
      context: {
        location: "San Francisco, CA",
        projectType: "residential",
        uploadedDocs: [
          {
            name: "plans.pdf",
            type: "pdf",
            content: "Sample construction plans",
          },
        ],
      },
    };

    const response = await orchestrator(request);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
  });

  it("should handle requests without context", async () => {
    const request: OrchestratorRequest = {
      messages: [
        {
          role: "user",
          content: "What are typical construction costs?",
        },
      ],
      threadId: "test-thread-456",
    };

    const response = await orchestrator(request);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
  });

  it("should validate message format", async () => {
    const invalidRequest = {
      messages: null,
      threadId: "test-thread",
    } as any;

    const response = await orchestrator(invalidRequest);

    expect(response.status).toBe(400);
  });

  it("should handle empty message content", async () => {
    const request: OrchestratorRequest = {
      messages: [
        {
          role: "user",
          content: "",
        },
      ],
      threadId: "test-thread",
    };

    const response = await orchestrator(request);

    expect(response.status).toBe(400);
  });

  it("should handle non-user last message", async () => {
    const request: OrchestratorRequest = {
      messages: [
        {
          role: "assistant",
          content: "Hello, how can I help you?",
        },
      ],
      threadId: "test-thread",
    };

    const response = await orchestrator(request);

    expect(response.status).toBe(400);
  });
});

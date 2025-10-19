// @module: orchestrator_test
// Tests for the Estimator Assistant orchestrator

import { describe, it, expect, vi } from "vitest";
import { orchestrator } from "../index";
import type { OrchestratorRequest } from "../types";

// Mock the dependencies
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

describe("Orchestrator", () => {
  it("should process a valid request", async () => {
    const request: OrchestratorRequest = {
      messages: [
        {
          role: "user",
          content: "What is the cost of building a 2000 sq ft house?",
        },
      ],
      threadId: "test-thread",
      userId: "test-user",
    };

    const response = await orchestrator(request);

    expect(response).toBeInstanceOf(Response);
  });

  it("should reject invalid message format", async () => {
    const request = {
      messages: null,
      threadId: "test-thread",
    } as any;

    const response = await orchestrator(request);

    expect(response.status).toBe(400);
  });

  it("should reject empty messages array", async () => {
    const request: OrchestratorRequest = {
      messages: [],
      threadId: "test-thread",
    };

    const response = await orchestrator(request);

    expect(response.status).toBe(400);
  });

  it("should reject non-user last message", async () => {
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

  it("should reject empty message content", async () => {
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
});

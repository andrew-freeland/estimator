// @module: orchestrator_types
// Type definitions for the Estimator Assistant orchestrator
// Provides unified message and context types

import "server-only";

// Core message interface
export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  metadata?: Record<string, any>;
}

// Orchestrator request interface
export interface OrchestratorRequest {
  messages: Message[];
  threadId?: string;
  userId?: string;
  sessionId?: string;
  context?: OrchestratorContext;
}

// Orchestrator response interface
export interface OrchestratorResponse {
  success: boolean;
  message?: string;
  error?: string;
  agent?: string;
  confidence?: number;
  metadata?: Record<string, any>;
}

// Context interface for orchestrator
export interface OrchestratorContext {
  location?: string;
  projectType?: string;
  timeline?: string;
  budget?: number;
  uploadedDocs?: Array<{
    name: string;
    type: string;
    content: string;
    size?: number;
    lastModified?: string;
  }>;
  userPreferences?: {
    units?: "metric" | "imperial";
    currency?: string;
    language?: string;
  };
  sessionData?: Record<string, any>;
}

// Agent type definitions
export type AgentType =
  | "estimator"
  | "confidence"
  | "profitability"
  | "contract";

// Agent registry interface
export interface AgentRegistry {
  [key: string]: AgentType;
}

// Agent execution result
export interface AgentResult {
  agent: string;
  success: boolean;
  response?: string;
  confidence?: number;
  duration: number;
  timestamp: string;
  error?: string;
  metadata?: Record<string, any>;
}

// System prompt context
export interface SystemPromptContext {
  userId?: string;
  sessionId?: string;
  context?: OrchestratorContext;
}

// Chat session interface
export interface ChatSession {
  id: string;
  userId: string;
  messages: Message[];
  context?: OrchestratorContext;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

// Agent configuration interface
export interface AgentConfig {
  name: string;
  description: string;
  active: boolean;
  systemPrompt: string;
  capabilities: string[];
  dependencies?: string[];
}

// Orchestrator configuration
export interface OrchestratorConfig {
  defaultAgent: AgentType;
  timeout: number;
  maxRetries: number;
  logging: boolean;
  agents: Record<AgentType, AgentConfig>;
}

// Error types
export class OrchestratorError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public metadata?: Record<string, any>,
  ) {
    super(message);
    this.name = "OrchestratorError";
  }
}

// Validation error
export class ValidationError extends OrchestratorError {
  constructor(message: string, metadata?: Record<string, any>) {
    super(message, "VALIDATION_ERROR", 400, metadata);
    this.name = "ValidationError";
  }
}

// Agent error
export class AgentError extends OrchestratorError {
  constructor(
    message: string,
    public agent: string,
    metadata?: Record<string, any>,
  ) {
    super(message, "AGENT_ERROR", 500, metadata);
    this.name = "AgentError";
  }
}

// Timeout error
export class TimeoutError extends OrchestratorError {
  constructor(agent: string, timeout: number) {
    super(`Agent ${agent} timed out after ${timeout}ms`, "TIMEOUT_ERROR", 408, {
      agent,
      timeout,
    });
    this.name = "TimeoutError";
  }
}

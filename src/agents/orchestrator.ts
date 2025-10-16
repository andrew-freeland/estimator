// @module: orchestrator
// Central Orchestrator for Estimator Assistant MCP
// Coordinates agent execution, manages context, and handles tool calls

import "server-only";
import { ingestionAgent } from "./ingestion_agent";
import { ratesAgent } from "./rates_agent";
import { explainerAgent } from "./explainer_agent";
import logger from "@/lib/logger";

// EA_ prefix for Estimator Assistant
const EA_ORCHESTRATOR_TIMEOUT = parseInt(
  process.env.EA_ORCHESTRATOR_TIMEOUT || "300000",
); // 5 minutes

// Shared context object for all agents
export interface EstimatorContext {
  project_id: string;
  client: string;
  job_id?: string;
  retrieved_docs: Array<{
    id: string;
    content: string;
    relevance: number;
    source: string;
    type: string;
  }>;
  tools_used: Array<{
    tool: string;
    timestamp: string;
    success: boolean;
    duration: number;
    error?: string;
  }>;
  session_id: string;
  user_id: string;
  location?: string;
  timeline?: string;
  scope?: string[];
  constraints?: string[];
  metadata: Record<string, any>;
}

// Agent execution result
export interface AgentResult {
  agent: string;
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
  timestamp: string;
}

// Orchestrator request
export interface OrchestratorRequest {
  clientId: string;
  jobId?: string;
  projectDescription: string;
  location?: string;
  timeline?: string;
  scope?: string[];
  constraints?: string[];
  inputFiles?: Array<{
    path: string;
    type: "file" | "transcript" | "text";
    content?: string;
    buffer?: Buffer;
    mimeType?: string;
  }>;
  userId: string;
  sessionId: string;
}

// Orchestrator response
export interface OrchestratorResponse {
  success: boolean;
  context: EstimatorContext;
  results: {
    ingestion: AgentResult;
    rates: AgentResult;
    explanation: AgentResult;
  };
  finalEstimate?: {
    estimate: number;
    confidence: number;
    reasoning: string[];
    sources: string[];
  };
  error?: string;
  totalDuration: number;
}

export class EstimatorOrchestrator {
  private static instance: EstimatorOrchestrator;

  private constructor() {}

  public static getInstance(): EstimatorOrchestrator {
    if (!EstimatorOrchestrator.instance) {
      EstimatorOrchestrator.instance = new EstimatorOrchestrator();
    }
    return EstimatorOrchestrator.instance;
  }

  /**
   * Main orchestration method - sequences agents in order
   */
  async orchestrate(
    request: OrchestratorRequest,
  ): Promise<OrchestratorResponse> {
    const startTime = Date.now();
    const context: EstimatorContext = {
      project_id: request.jobId || `project_${Date.now()}`,
      client: request.clientId,
      job_id: request.jobId,
      retrieved_docs: [],
      tools_used: [],
      session_id: request.sessionId,
      user_id: request.userId,
      location: request.location,
      timeline: request.timeline,
      scope: request.scope,
      constraints: request.constraints,
      metadata: {},
    };

    const results: {
      ingestion: AgentResult;
      rates: AgentResult;
      explanation: AgentResult;
    } = {
      ingestion: {
        agent: "ingestion",
        success: false,
        duration: 0,
        timestamp: new Date().toISOString(),
      },
      rates: {
        agent: "rates",
        success: false,
        duration: 0,
        timestamp: new Date().toISOString(),
      },
      explanation: {
        agent: "explanation",
        success: false,
        duration: 0,
        timestamp: new Date().toISOString(),
      },
    };

    try {
      logger.info(
        `Starting orchestration for client ${request.clientId}, project ${context.project_id}`,
      );

      // Phase 1: Ingestion Agent
      logger.info("Phase 1: Running ingestion agent");
      results.ingestion = await this.executeAgent("ingestion", async () => {
        const ingestionResults: any[] = [];

        // Process input files if provided
        if (request.inputFiles) {
          for (const file of request.inputFiles) {
            const result = await ingestionAgent.ingest({
              clientId: request.clientId,
              jobId: request.jobId,
              sourcePath: file.path,
              sourceType: file.type,
              content: file.content,
              fileBuffer: file.buffer,
              mimeType: file.mimeType,
              metadata: {
                sessionId: request.sessionId,
                userId: request.userId,
              },
            });

            if (result.success) {
              ingestionResults.push(result);
              // Add to context retrieved docs
              context.retrieved_docs.push({
                id: `doc_${Date.now()}_${Math.random()}`,
                content: result.content || "",
                relevance: 1.0,
                source: file.path,
                type: file.type,
              });
            }
          }
        }

        return {
          processedFiles: ingestionResults.length,
          results: ingestionResults,
        };
      });

      // Phase 2: Rates Agent
      logger.info("Phase 2: Running rates agent");
      results.rates = await this.executeAgent("rates", async () => {
        const ratesResult = await ratesAgent.getRates({
          clientId: request.clientId,
          jobId: request.jobId,
          location: request.location,
          categories: request.scope,
        });

        return ratesResult;
      });

      // Phase 3: Explainer Agent
      logger.info("Phase 3: Running explainer agent");
      results.explanation = await this.executeAgent("explanation", async () => {
        const explanationResult = await explainerAgent.explainEstimate({
          clientId: request.clientId,
          jobId: request.jobId,
          projectDescription: request.projectDescription,
          location: request.location,
          timeline: request.timeline,
          scope: request.scope,
          constraints: request.constraints,
        });

        return explanationResult;
      });

      // Extract final estimate from explanation result
      let finalEstimate;
      if (results.explanation.success && results.explanation.data?.breakdown) {
        const breakdown = results.explanation.data.breakdown;
        finalEstimate = {
          estimate: breakdown.totalCost,
          confidence: breakdown.overallConfidence,
          reasoning: breakdown.categories.map(
            (cat) =>
              `${cat.name}: $${cat.cost.toLocaleString()} (${(cat.confidence * 100).toFixed(1)}% confidence)`,
          ),
          sources: results.explanation.data.sources?.map((s) => s.source) || [],
        };
      }

      const totalDuration = Date.now() - startTime;
      logger.info(`Orchestration completed in ${totalDuration}ms`);

      return {
        success: true,
        context,
        results,
        finalEstimate,
        totalDuration,
      };
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      logger.error("Orchestration failed:", error);

      return {
        success: false,
        context,
        results,
        error: error instanceof Error ? error.message : "Unknown error",
        totalDuration,
      };
    }
  }

  /**
   * Execute an agent with error handling and logging
   */
  private async executeAgent(
    agentName: string,
    agentFunction: () => Promise<any>,
  ): Promise<AgentResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    try {
      logger.info(`Executing ${agentName} agent`);

      const result = await Promise.race([
        agentFunction(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`${agentName} agent timeout`)),
            EA_ORCHESTRATOR_TIMEOUT,
          ),
        ),
      ]);

      const duration = Date.now() - startTime;
      logger.info(`${agentName} agent completed in ${duration}ms`);

      return {
        agent: agentName,
        success: true,
        data: result,
        duration,
        timestamp,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`${agentName} agent failed:`, error);

      return {
        agent: agentName,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        duration,
        timestamp,
      };
    }
  }

  /**
   * Get orchestration status for a session
   */
  async getStatus(_sessionId: string): Promise<{
    status: "running" | "completed" | "failed";
    progress: number;
    currentPhase?: string;
    results?: Partial<OrchestratorResponse>;
  }> {
    // This would typically query a status store (Redis, database, etc.)
    // For now, return a placeholder
    return {
      status: "completed",
      progress: 100,
      currentPhase: "completed",
    };
  }

  /**
   * Cancel an ongoing orchestration
   */
  async cancel(sessionId: string): Promise<boolean> {
    // This would typically cancel running processes
    logger.info(`Cancelling orchestration for session ${sessionId}`);
    return true;
  }

  /**
   * Get orchestration history for a client
   */
  async getHistory(
    _clientId: string,
    _limit = 10,
  ): Promise<
    Array<{
      sessionId: string;
      timestamp: string;
      success: boolean;
      duration: number;
      projectId: string;
    }>
  > {
    // This would typically query a history store
    return [];
  }
}

// Export singleton instance
export const estimatorOrchestrator = EstimatorOrchestrator.getInstance();

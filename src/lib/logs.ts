// @module: structured_logging
// Structured logging system for Estimator Assistant MCP
// Provides database-backed logging with JSON serialization

import "server-only";
import { db } from "@/lib/gcp/db";
import { LogsTable } from "@/lib/db/pg/schema.pg";
import { sql, and, eq, gte, lte, desc } from "drizzle-orm";
import logger from "@/lib/logger";

// EA_ prefix for Estimator Assistant
const EA_LOG_BATCH_SIZE = parseInt(process.env.EA_LOG_BATCH_SIZE || "100");
const EA_LOG_FLUSH_INTERVAL = parseInt(
  process.env.EA_LOG_FLUSH_INTERVAL || "5000",
); // 5 seconds

// Log event types
export type LogEventType =
  | "agent_execution"
  | "tool_call"
  | "embedding_generation"
  | "file_upload"
  | "transcription"
  | "estimate_generation"
  | "error"
  | "security_event";

// Log severity levels
export type LogSeverity = "debug" | "info" | "warn" | "error" | "fatal";

// Log entry interface
export interface LogEntry {
  eventType: LogEventType;
  severity: LogSeverity;
  clientId?: string;
  userId?: string;
  sessionId?: string;
  projectId?: string;
  jobId?: string;
  payload: Record<string, any>;
  source?: string;
  duration?: number;
  success?: boolean;
  timestamp?: Date;
}

// Batch logging for performance
class LogBatch {
  private entries: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  add(entry: LogEntry) {
    this.entries.push({
      ...entry,
      timestamp: entry.timestamp || new Date(),
    });

    // Auto-flush when batch is full
    if (this.entries.length >= EA_LOG_BATCH_SIZE) {
      this.flush();
    } else if (!this.flushTimer) {
      // Set up auto-flush timer
      this.flushTimer = setTimeout(() => {
        this.flush();
      }, EA_LOG_FLUSH_INTERVAL);
    }
  }

  async flush() {
    if (this.entries.length === 0) return;

    const entriesToFlush = [...this.entries];
    this.entries = [];

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    try {
      // Batch insert logs
      await db.insert(LogsTable).values(
        entriesToFlush.map((entry) => ({
          eventType: entry.eventType,
          severity: entry.severity,
          clientId: entry.clientId,
          userId: entry.userId,
          sessionId: entry.sessionId,
          projectId: entry.projectId,
          jobId: entry.jobId,
          payload: entry.payload,
          source: entry.source,
          duration: entry.duration,
          success: entry.success,
          timestamp: entry.timestamp,
        })),
      );

      logger.debug(`Flushed ${entriesToFlush.length} log entries to database`);
    } catch (error) {
      logger.error("Failed to flush logs to database:", error);
      // Fallback to console logging
      entriesToFlush.forEach((entry) => {
        console.error("Failed log entry:", entry);
      });
    }
  }
}

// Global log batch instance
const logBatch = new LogBatch();

// Structured logging class
export class StructuredLogger {
  private source: string;

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Log an event with structured data
   */
  log(entry: Omit<LogEntry, "source">) {
    const logEntry: LogEntry = {
      ...entry,
      source: this.source,
    };

    // Add to batch for database storage
    logBatch.add(logEntry);

    // Also log to console for development
    if (process.env.NODE_ENV === "development") {
      const consoleMessage = `[${entry.severity.toUpperCase()}] ${entry.eventType}: ${JSON.stringify(entry.payload)}`;

      switch (entry.severity) {
        case "debug":
          logger.debug(consoleMessage);
          break;
        case "info":
          logger.info(consoleMessage);
          break;
        case "warn":
          logger.warn(consoleMessage);
          break;
        case "error":
        case "fatal":
          logger.error(consoleMessage);
          break;
      }
    }
  }

  /**
   * Log agent execution
   */
  logAgentExecution(params: {
    agent: string;
    clientId: string;
    userId: string;
    sessionId: string;
    projectId?: string;
    jobId?: string;
    success: boolean;
    duration: number;
    error?: string;
    input?: any;
    output?: any;
  }) {
    this.log({
      eventType: "agent_execution",
      severity: params.success ? "info" : "error",
      clientId: params.clientId,
      userId: params.userId,
      sessionId: params.sessionId,
      projectId: params.projectId,
      jobId: params.jobId,
      payload: {
        agent: params.agent,
        success: params.success,
        duration: params.duration,
        error: params.error,
        input: params.input,
        output: params.output,
      },
      duration: params.duration,
      success: params.success,
    });
  }

  /**
   * Log tool call
   */
  logToolCall(params: {
    toolName: string;
    clientId: string;
    userId: string;
    sessionId: string;
    projectId?: string;
    jobId?: string;
    success: boolean;
    duration: number;
    error?: string;
    request?: any;
    response?: any;
  }) {
    this.log({
      eventType: "tool_call",
      severity: params.success ? "info" : "error",
      clientId: params.clientId,
      userId: params.userId,
      sessionId: params.sessionId,
      projectId: params.projectId,
      jobId: params.jobId,
      payload: {
        toolName: params.toolName,
        success: params.success,
        duration: params.duration,
        error: params.error,
        request: params.request,
        response: params.response,
      },
      duration: params.duration,
      success: params.success,
    });
  }

  /**
   * Log embedding generation
   */
  logEmbeddingGeneration(params: {
    clientId: string;
    userId: string;
    sessionId: string;
    projectId?: string;
    jobId?: string;
    sourcePath: string;
    sourceType: string;
    textLength: number;
    embeddingDimensions: number;
    success: boolean;
    duration: number;
    error?: string;
  }) {
    this.log({
      eventType: "embedding_generation",
      severity: params.success ? "info" : "error",
      clientId: params.clientId,
      userId: params.userId,
      sessionId: params.sessionId,
      projectId: params.projectId,
      jobId: params.jobId,
      payload: {
        sourcePath: params.sourcePath,
        sourceType: params.sourceType,
        textLength: params.textLength,
        embeddingDimensions: params.embeddingDimensions,
        success: params.success,
        duration: params.duration,
        error: params.error,
      },
      duration: params.duration,
      success: params.success,
    });
  }

  /**
   * Log file upload
   */
  logFileUpload(params: {
    clientId: string;
    userId: string;
    sessionId: string;
    projectId?: string;
    jobId?: string;
    filename: string;
    fileSize: number;
    mimeType: string;
    success: boolean;
    duration: number;
    error?: string;
    storageKey?: string;
  }) {
    this.log({
      eventType: "file_upload",
      severity: params.success ? "info" : "error",
      clientId: params.clientId,
      userId: params.userId,
      sessionId: params.sessionId,
      projectId: params.projectId,
      jobId: params.jobId,
      payload: {
        filename: params.filename,
        fileSize: params.fileSize,
        mimeType: params.mimeType,
        success: params.success,
        duration: params.duration,
        error: params.error,
        storageKey: params.storageKey,
      },
      duration: params.duration,
      success: params.success,
    });
  }

  /**
   * Log transcription
   */
  logTranscription(params: {
    clientId: string;
    userId: string;
    sessionId: string;
    projectId?: string;
    jobId?: string;
    audioFileSize: number;
    audioMimeType: string;
    transcriptLength: number;
    language: string;
    confidence: number;
    success: boolean;
    duration: number;
    error?: string;
  }) {
    this.log({
      eventType: "transcription",
      severity: params.success ? "info" : "error",
      clientId: params.clientId,
      userId: params.userId,
      sessionId: params.sessionId,
      projectId: params.projectId,
      jobId: params.jobId,
      payload: {
        audioFileSize: params.audioFileSize,
        audioMimeType: params.audioMimeType,
        transcriptLength: params.transcriptLength,
        language: params.language,
        confidence: params.confidence,
        success: params.success,
        duration: params.duration,
        error: params.error,
      },
      duration: params.duration,
      success: params.success,
    });
  }

  /**
   * Log estimate generation
   */
  logEstimateGeneration(params: {
    clientId: string;
    userId: string;
    sessionId: string;
    projectId: string;
    jobId?: string;
    estimate: number;
    confidence: number;
    success: boolean;
    duration: number;
    error?: string;
    breakdown?: any;
  }) {
    this.log({
      eventType: "estimate_generation",
      severity: params.success ? "info" : "error",
      clientId: params.clientId,
      userId: params.userId,
      sessionId: params.sessionId,
      projectId: params.projectId,
      jobId: params.jobId,
      payload: {
        estimate: params.estimate,
        confidence: params.confidence,
        success: params.success,
        duration: params.duration,
        error: params.error,
        breakdown: params.breakdown,
      },
      duration: params.duration,
      success: params.success,
    });
  }

  /**
   * Log security event
   */
  logSecurityEvent(params: {
    event: string;
    clientId?: string;
    userId?: string;
    sessionId?: string;
    projectId?: string;
    jobId?: string;
    severity: LogSeverity;
    details: Record<string, any>;
  }) {
    this.log({
      eventType: "security_event",
      severity: params.severity,
      clientId: params.clientId,
      userId: params.userId,
      sessionId: params.sessionId,
      projectId: params.projectId,
      jobId: params.jobId,
      payload: {
        event: params.event,
        details: params.details,
      },
    });
  }

  /**
   * Log error
   */
  logError(params: {
    error: string;
    clientId?: string;
    userId?: string;
    sessionId?: string;
    projectId?: string;
    jobId?: string;
    stack?: string;
    context?: Record<string, any>;
  }) {
    this.log({
      eventType: "error",
      severity: "error",
      clientId: params.clientId,
      userId: params.userId,
      sessionId: params.sessionId,
      projectId: params.projectId,
      jobId: params.jobId,
      payload: {
        error: params.error,
        stack: params.stack,
        context: params.context,
      },
      success: false,
    });
  }
}

// Create logger instances for different components
export const agentLogger = new StructuredLogger("agent");
export const toolLogger = new StructuredLogger("tool");
export const storageLogger = new StructuredLogger("storage");
export const apiLogger = new StructuredLogger("api");
export const securityLogger = new StructuredLogger("security");

// Utility functions for common logging patterns
export const logAgentExecution = (
  _agent: string,
  params: Parameters<StructuredLogger["logAgentExecution"]>[0],
) => {
  agentLogger.logAgentExecution(params);
};

export const logToolCall = (
  params: Parameters<StructuredLogger["logToolCall"]>[0],
) => {
  toolLogger.logToolCall(params);
};

export const logFileUpload = (
  params: Parameters<StructuredLogger["logFileUpload"]>[0],
) => {
  storageLogger.logFileUpload(params);
};

export const logTranscription = (
  params: Parameters<StructuredLogger["logTranscription"]>[0],
) => {
  storageLogger.logTranscription(params);
};

export const logEstimateGeneration = (
  params: Parameters<StructuredLogger["logEstimateGeneration"]>[0],
) => {
  agentLogger.logEstimateGeneration(params);
};

export const logSecurityEvent = (
  params: Parameters<StructuredLogger["logSecurityEvent"]>[0],
) => {
  securityLogger.logSecurityEvent(params);
};

export const logError = (
  params: Parameters<StructuredLogger["logError"]>[0],
) => {
  agentLogger.logError(params);
};

// Graceful shutdown - flush remaining logs
export async function flushLogs() {
  await logBatch.flush();
}

// Query logs for analysis
export async function queryLogs(params: {
  eventType?: LogEventType;
  severity?: LogSeverity;
  clientId?: string;
  userId?: string;
  sessionId?: string;
  projectId?: string;
  jobId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}) {
  try {
    // Research-backed fix: Drizzle ORM conditional query pattern
    // Use and() with undefined filters to avoid type narrowing issues
    const query = db
      .select()
      .from(LogsTable)
      .where(
        and(
          params.eventType
            ? eq(LogsTable.eventType, params.eventType)
            : undefined,
          params.severity ? eq(LogsTable.severity, params.severity) : undefined,
          params.clientId ? eq(LogsTable.clientId, params.clientId) : undefined,
          params.userId ? eq(LogsTable.userId, params.userId) : undefined,
          params.sessionId
            ? eq(LogsTable.sessionId, params.sessionId)
            : undefined,
          params.projectId
            ? eq(LogsTable.projectId, params.projectId)
            : undefined,
          params.jobId ? eq(LogsTable.jobId, params.jobId) : undefined,
          params.startDate
            ? gte(LogsTable.timestamp, params.startDate)
            : undefined,
          params.endDate ? lte(LogsTable.timestamp, params.endDate) : undefined,
        ),
      )
      .orderBy(desc(LogsTable.timestamp))
      .limit(params.limit || 100)
      .offset(params.offset || 0);

    return await query;
  } catch (error) {
    logger.error("Failed to query logs:", error);
    throw error;
  }
}

// Get log statistics
export async function getLogStats(params: {
  clientId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  try {
    // Research-backed fix: Drizzle ORM conditional query pattern
    const query = db
      .select({
        eventType: LogsTable.eventType,
        severity: LogsTable.severity,
        count: sql<number>`count(*)`,
        avgDuration: sql<number>`avg(${LogsTable.duration})`,
        successRate: sql<number>`avg(case when ${LogsTable.success} then 1.0 else 0.0 end)`,
      })
      .from(LogsTable)
      .where(
        and(
          params.clientId ? eq(LogsTable.clientId, params.clientId) : undefined,
          params.userId ? eq(LogsTable.userId, params.userId) : undefined,
          params.startDate
            ? gte(LogsTable.timestamp, params.startDate)
            : undefined,
          params.endDate ? lte(LogsTable.timestamp, params.endDate) : undefined,
        ),
      )
      .groupBy(LogsTable.eventType, LogsTable.severity);

    return await query;
  } catch (error) {
    logger.error("Failed to get log stats:", error);
    throw error;
  }
}

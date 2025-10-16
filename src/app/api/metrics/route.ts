// @module: metrics_api
// Metrics API endpoint for Estimator Assistant MCP
// Exposes system metrics and statistics

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { withSecurity } from "lib/security";
import { db } from "lib/gcp/db";
import {
  DocumentsTable,
  JobsTable,
  LogsTable,
  EstimatesTable,
  ToolUsageTable,
} from "lib/db/pg/schema.pg";
import { sql, count, avg, max, min } from "drizzle-orm";
import { getLogStats } from "lib/logs";
import logger from "lib/logger";

// Metrics interfaces
interface SystemMetrics {
  timestamp: string;
  documents: {
    total: number;
    byType: Record<string, number>;
    avgEmbeddingDimensions: number;
  };
  jobs: {
    total: number;
    byStatus: Record<string, number>;
    avgEstimatedCost: number;
    avgActualCost: number;
  };
  estimates: {
    total: number;
    avgConfidence: number;
    avgEstimate: number;
    byConfidenceRange: Record<string, number>;
  };
  logs: {
    total: number;
    byEventType: Record<string, number>;
    bySeverity: Record<string, number>;
    avgDuration: number;
  };
  toolUsage: {
    total: number;
    byTool: Record<string, number>;
    successRate: number;
    avgDuration: number;
  };
  performance: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    nodeVersion: string;
    platform: string;
  };
}

// Get document metrics
async function getDocumentMetrics(
  clientId?: string,
): Promise<SystemMetrics["documents"]> {
  try {
    let query = db
      .select({
        total: count(),
        sourceType: DocumentsTable.sourceType,
        avgDimensions: avg(sql`array_length(${DocumentsTable.embedding}, 1)`),
      })
      .from(DocumentsTable)
      .groupBy(DocumentsTable.sourceType);

    if (clientId) {
      query = query.where(sql`${DocumentsTable.clientId} = ${clientId}`);
    }

    const results = await query;

    const byType = results.reduce(
      (acc, row) => {
        acc[row.sourceType] = Number(row.total);
        return acc;
      },
      {} as Record<string, number>,
    );

    const total = results.reduce((sum, row) => sum + Number(row.total), 0);
    const avgEmbeddingDimensions =
      results.length > 0
        ? results.reduce(
            (sum, row) => sum + (Number(row.avgDimensions) || 0),
            0,
          ) / results.length
        : 0;

    return {
      total,
      byType,
      avgEmbeddingDimensions,
    };
  } catch (error) {
    logger.error("Error getting document metrics:", error);
    return { total: 0, byType: {}, avgEmbeddingDimensions: 0 };
  }
}

// Get job metrics
async function getJobMetrics(
  clientId?: string,
): Promise<SystemMetrics["jobs"]> {
  try {
    let query = db
      .select({
        total: count(),
        status: JobsTable.status,
        avgEstimatedCost: avg(JobsTable.estimatedCost),
        avgActualCost: avg(JobsTable.actualCost),
      })
      .from(JobsTable)
      .groupBy(JobsTable.status);

    if (clientId) {
      query = query.where(sql`${JobsTable.clientId} = ${clientId}`);
    }

    const results = await query;

    const byStatus = results.reduce(
      (acc, row) => {
        acc[row.status || "unknown"] = Number(row.total);
        return acc;
      },
      {} as Record<string, number>,
    );

    const total = results.reduce((sum, row) => sum + Number(row.total), 0);
    const avgEstimatedCost =
      results.length > 0
        ? results.reduce(
            (sum, row) => sum + (Number(row.avgEstimatedCost) || 0),
            0,
          ) / results.length
        : 0;
    const avgActualCost =
      results.length > 0
        ? results.reduce(
            (sum, row) => sum + (Number(row.avgActualCost) || 0),
            0,
          ) / results.length
        : 0;

    return {
      total,
      byStatus,
      avgEstimatedCost,
      avgActualCost,
    };
  } catch (error) {
    logger.error("Error getting job metrics:", error);
    return { total: 0, byStatus: {}, avgEstimatedCost: 0, avgActualCost: 0 };
  }
}

// Get estimate metrics
async function getEstimateMetrics(
  clientId?: string,
): Promise<SystemMetrics["estimates"]> {
  try {
    let query = db
      .select({
        total: count(),
        avgConfidence: avg(EstimatesTable.confidence),
        avgEstimate: avg(EstimatesTable.estimate),
        minConfidence: min(EstimatesTable.confidence),
        maxConfidence: max(EstimatesTable.confidence),
      })
      .from(EstimatesTable);

    if (clientId) {
      query = query.where(sql`${EstimatesTable.clientId} = ${clientId}`);
    }

    const result = await query.then((rows) => rows[0]);

    if (!result) {
      return {
        total: 0,
        avgConfidence: 0,
        avgEstimate: 0,
        byConfidenceRange: {},
      };
    }

    const total = Number(result.total);
    const avgConfidence = Number(result.avgConfidence) || 0;
    const avgEstimate = Number(result.avgEstimate) || 0;
    const _minConf = Number(result.minConfidence) || 0;
    const _maxConf = Number(result.maxConfidence) || 0;

    // Calculate confidence ranges
    const byConfidenceRange = {
      "0.0-0.3": 0,
      "0.3-0.6": 0,
      "0.6-0.8": 0,
      "0.8-1.0": 0,
    };

    // Get detailed confidence distribution
    let confidenceQuery = db
      .select({
        confidence: EstimatesTable.confidence,
        count: count(),
      })
      .from(EstimatesTable)
      .groupBy(EstimatesTable.confidence);

    if (clientId) {
      confidenceQuery = confidenceQuery.where(
        sql`${EstimatesTable.clientId} = ${clientId}`,
      );
    }

    const confidenceResults = await confidenceQuery;

    confidenceResults.forEach((row) => {
      const conf = Number(row.confidence);
      const count = Number(row.count);

      if (conf >= 0.0 && conf < 0.3) byConfidenceRange["0.0-0.3"] += count;
      else if (conf >= 0.3 && conf < 0.6) byConfidenceRange["0.3-0.6"] += count;
      else if (conf >= 0.6 && conf < 0.8) byConfidenceRange["0.6-0.8"] += count;
      else if (conf >= 0.8 && conf <= 1.0)
        byConfidenceRange["0.8-1.0"] += count;
    });

    return {
      total,
      avgConfidence,
      avgEstimate,
      byConfidenceRange,
    };
  } catch (error) {
    logger.error("Error getting estimate metrics:", error);
    return {
      total: 0,
      avgConfidence: 0,
      avgEstimate: 0,
      byConfidenceRange: {},
    };
  }
}

// Get log metrics
async function getLogMetrics(
  clientId?: string,
): Promise<SystemMetrics["logs"]> {
  try {
    let query = db
      .select({
        total: count(),
        eventType: LogsTable.eventType,
        severity: LogsTable.severity,
        avgDuration: avg(LogsTable.duration),
      })
      .from(LogsTable)
      .groupBy(LogsTable.eventType, LogsTable.severity);

    if (clientId) {
      query = query.where(sql`${LogsTable.clientId} = ${clientId}`);
    }

    const results = await query;

    const byEventType = results.reduce(
      (acc, row) => {
        acc[row.eventType] = (acc[row.eventType] || 0) + Number(row.total);
        return acc;
      },
      {} as Record<string, number>,
    );

    const bySeverity = results.reduce(
      (acc, row) => {
        acc[row.severity || "unknown"] =
          (acc[row.severity || "unknown"] || 0) + Number(row.total);
        return acc;
      },
      {} as Record<string, number>,
    );

    const total = results.reduce((sum, row) => sum + Number(row.total), 0);
    const avgDuration =
      results.length > 0
        ? results.reduce(
            (sum, row) => sum + (Number(row.avgDuration) || 0),
            0,
          ) / results.length
        : 0;

    return {
      total,
      byEventType,
      bySeverity,
      avgDuration,
    };
  } catch (error) {
    logger.error("Error getting log metrics:", error);
    return { total: 0, byEventType: {}, bySeverity: {}, avgDuration: 0 };
  }
}

// Get tool usage metrics
async function getToolUsageMetrics(
  clientId?: string,
): Promise<SystemMetrics["toolUsage"]> {
  try {
    let query = db
      .select({
        total: count(),
        toolName: ToolUsageTable.toolName,
        success: ToolUsageTable.success,
        avgDuration: avg(ToolUsageTable.duration),
      })
      .from(ToolUsageTable)
      .groupBy(ToolUsageTable.toolName, ToolUsageTable.success);

    if (clientId) {
      query = query.where(sql`${ToolUsageTable.clientId} = ${clientId}`);
    }

    const results = await query;

    const byTool = results.reduce(
      (acc, row) => {
        acc[row.toolName] = (acc[row.toolName] || 0) + Number(row.total);
        return acc;
      },
      {} as Record<string, number>,
    );

    const total = results.reduce((sum, row) => sum + Number(row.total), 0);
    const successfulCalls = results
      .filter((row) => row.success)
      .reduce((sum, row) => sum + Number(row.total), 0);

    const successRate = total > 0 ? successfulCalls / total : 0;
    const avgDuration =
      results.length > 0
        ? results.reduce(
            (sum, row) => sum + (Number(row.avgDuration) || 0),
            0,
          ) / results.length
        : 0;

    return {
      total,
      byTool,
      successRate,
      avgDuration,
    };
  } catch (error) {
    logger.error("Error getting tool usage metrics:", error);
    return { total: 0, byTool: {}, successRate: 0, avgDuration: 0 };
  }
}

// Get performance metrics
function getPerformanceMetrics(): SystemMetrics["performance"] {
  return {
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    nodeVersion: process.version,
    platform: process.platform,
  };
}

// Main metrics handler
export async function GET(request: NextRequest) {
  return withSecurity(
    request,
    async (context) => {
      try {
        // Get all metrics in parallel
        const [documents, jobs, estimates, logs, toolUsage, performance] =
          await Promise.all([
            getDocumentMetrics(context.clientId),
            getJobMetrics(context.clientId),
            getEstimateMetrics(context.clientId),
            getLogMetrics(context.clientId),
            getToolUsageMetrics(context.clientId),
            Promise.resolve(getPerformanceMetrics()),
          ]);

        const metrics: SystemMetrics = {
          timestamp: new Date().toISOString(),
          documents,
          jobs,
          estimates,
          logs,
          toolUsage,
          performance,
        };

        return NextResponse.json({
          success: true,
          data: metrics,
        });
      } catch (error) {
        logger.error("Error getting metrics:", error);

        return NextResponse.json(
          {
            success: false,
            error: "Failed to get metrics",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 },
        );
      }
    },
    ["read:logs"], // Required permissions
  );
}

// Simple metrics for monitoring systems
export async function HEAD(_request: NextRequest) {
  try {
    // Quick count of total documents and estimates
    const [docCount, estCount] = await Promise.all([
      db.select({ count: count() }).from(DocumentsTable),
      db.select({ count: count() }).from(EstimatesTable),
    ]);

    const totalDocs = Number(docCount[0]?.count || 0);
    const totalEstimates = Number(estCount[0]?.count || 0);

    // Return metrics as headers
    const response = new NextResponse(null, { status: 200 });
    response.headers.set("X-Documents-Count", totalDocs.toString());
    response.headers.set("X-Estimates-Count", totalEstimates.toString());
    response.headers.set("X-Uptime", process.uptime().toString());

    return response;
  } catch (_error) {
    return new NextResponse(null, { status: 500 });
  }
}

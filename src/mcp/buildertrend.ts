// @module: buildertrend_mcp
// Buildertrend MCP tool for Estimator Assistant
// Provides access to job data, schedules, and historical costs

import "server-only";
import { Tool } from "ai";
import logger from "lib/logger";
import { RateLimiter, InputValidator } from "lib/security";
import { logToolCall } from "lib/logs";

// EA_ prefix for Estimator Assistant
const EA_BUILDERTREND_API_KEY = process.env.EA_BUILDERTREND_API_KEY;
const EA_BUILDERTREND_BASE_URL =
  process.env.EA_BUILDERTREND_BASE_URL || "https://api.buildertrend.com/v1";

if (!EA_BUILDERTREND_API_KEY) {
  logger.warn(
    "EA_BUILDERTREND_API_KEY not set - Buildertrend tools will be disabled",
  );
}

// Types for Buildertrend API responses
interface BuildertrendJob {
  id: string;
  name: string;
  address: string;
  startDate: string;
  endDate: string;
  status: string;
  clientId: string;
  clientName: string;
  estimatedCost?: number;
  actualCost?: number;
}

interface BuildertrendSchedule {
  id: string;
  jobId: string;
  taskName: string;
  startDate: string;
  endDate: string;
  assignedTo: string;
  status: string;
  estimatedHours?: number;
  actualHours?: number;
}

interface BuildertrendCost {
  id: string;
  jobId: string;
  category: string;
  item: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  date: string;
  vendor?: string;
}

// Helper function to make authenticated API calls with security and rate limiting
async function makeBuildertrendRequest(
  endpoint: string,
  params?: Record<string, any>,
  context?: { userId: string; clientId: string; sessionId: string },
) {
  if (!EA_BUILDERTREND_API_KEY) {
    throw new Error("Buildertrend API key not configured");
  }

  // Rate limiting check
  if (context) {
    const rateLimitOk = await RateLimiter.checkRateLimit(
      {
        userId: context.userId,
        clientId: context.clientId,
        sessionId: context.sessionId,
      } as any,
      "buildertrend_api",
      50, // 50 requests per minute
      60000,
    );

    if (!rateLimitOk) {
      throw new Error("Rate limit exceeded for Buildertrend API");
    }
  }

  // Input validation
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") {
        params[key] = InputValidator.sanitizeString(value, 1000);
      }
    }
  }

  const url = new URL(`${EA_BUILDERTREND_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });
  }

  const startTime = Date.now();
  let success = false;
  let error: string | undefined;

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${EA_BUILDERTREND_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      error = `Buildertrend API error: ${response.status} ${response.statusText}`;
      throw new Error(error);
    }

    success = true;
    return response.json();
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error";
    throw err;
  } finally {
    // Log tool call
    if (context) {
      logToolCall({
        toolName: "buildertrend_api",
        clientId: context.clientId,
        userId: context.userId,
        sessionId: context.sessionId,
        success,
        duration: Date.now() - startTime,
        error,
        request: { endpoint, params },
      });
    }
  }
}

// Tool: Get job information
export const getBuildertrendJobTool: Tool = {
  description:
    "Get detailed information about a specific Buildertrend job including client, schedule, and cost data",
  parameters: {
    type: "object",
    properties: {
      jobId: {
        type: "string",
        description: "The Buildertrend job ID to retrieve information for",
      },
      includeSchedule: {
        type: "boolean",
        description: "Whether to include schedule/task information",
        default: true,
      },
      includeCosts: {
        type: "boolean",
        description: "Whether to include cost information",
        default: true,
      },
    },
    required: ["jobId"],
  },
  execute: async (
    { jobId, includeSchedule = true, includeCosts = true },
    context?: { userId: string; clientId: string; sessionId: string },
  ) => {
    try {
      // Input validation
      if (!InputValidator.validateJobId(jobId)) {
        throw new Error("Invalid job ID format");
      }

      logger.info(`Fetching Buildertrend job: ${jobId}`);

      // Get job details
      const job = (await makeBuildertrendRequest(
        `/jobs/${jobId}`,
        undefined,
        context,
      )) as BuildertrendJob;

      const result: any = {
        job,
        schedule: null,
        costs: null,
      };

      // Get schedule if requested
      if (includeSchedule) {
        try {
          result.schedule = (await makeBuildertrendRequest(
            `/jobs/${jobId}/schedule`,
            undefined,
            context,
          )) as BuildertrendSchedule[];
        } catch (error) {
          logger.warn(`Failed to fetch schedule for job ${jobId}:`, error);
        }
      }

      // Get costs if requested
      if (includeCosts) {
        try {
          result.costs = (await makeBuildertrendRequest(
            `/jobs/${jobId}/costs`,
            undefined,
            context,
          )) as BuildertrendCost[];
        } catch (error) {
          logger.warn(`Failed to fetch costs for job ${jobId}:`, error);
        }
      }

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      logger.error(`Error fetching Buildertrend job ${jobId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};

// Tool: Search jobs by criteria
export const searchBuildertrendJobsTool: Tool = {
  description:
    "Search Buildertrend jobs by various criteria like client, date range, or status",
  parameters: {
    type: "object",
    properties: {
      clientId: {
        type: "string",
        description: "Filter by client ID",
      },
      status: {
        type: "string",
        description:
          "Filter by job status (e.g., 'Active', 'Completed', 'On Hold')",
      },
      startDate: {
        type: "string",
        description: "Filter jobs starting after this date (YYYY-MM-DD)",
      },
      endDate: {
        type: "string",
        description: "Filter jobs ending before this date (YYYY-MM-DD)",
      },
      limit: {
        type: "number",
        description: "Maximum number of jobs to return",
        default: 50,
      },
    },
  },
  execute: async (
    { clientId, status, startDate, endDate, limit = 50 },
    context?: { userId: string; clientId: string; sessionId: string },
  ) => {
    try {
      // Input validation
      if (clientId && !InputValidator.validateClientId(clientId)) {
        throw new Error("Invalid client ID format");
      }
      if (limit < 1 || limit > 100) {
        throw new Error("Limit must be between 1 and 100");
      }

      logger.info("Searching Buildertrend jobs");

      const params: Record<string, any> = { limit };
      if (clientId) params.clientId = clientId;
      if (status) params.status = status;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const jobs = (await makeBuildertrendRequest(
        "/jobs",
        params,
        context,
      )) as BuildertrendJob[];

      return {
        success: true,
        data: {
          jobs,
          count: jobs.length,
        },
      };
    } catch (error) {
      logger.error("Error searching Buildertrend jobs:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};

// Tool: Get historical cost data
export const getBuildertrendHistoricalCostsTool: Tool = {
  description:
    "Get historical cost data for similar jobs or categories to help with estimation",
  parameters: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description:
          "Cost category to search for (e.g., 'Labor', 'Materials', 'Equipment')",
      },
      item: {
        type: "string",
        description: "Specific item or service to get historical costs for",
      },
      startDate: {
        type: "string",
        description: "Start date for historical data (YYYY-MM-DD)",
      },
      endDate: {
        type: "string",
        description: "End date for historical data (YYYY-MM-DD)",
      },
      limit: {
        type: "number",
        description: "Maximum number of cost records to return",
        default: 100,
      },
    },
  },
  execute: async (
    { category, item, startDate, endDate, limit = 100 },
    context?: { userId: string; clientId: string; sessionId: string },
  ) => {
    try {
      // Input validation
      if (limit < 1 || limit > 500) {
        throw new Error("Limit must be between 1 and 500");
      }

      logger.info("Fetching Buildertrend historical costs");

      const params: Record<string, any> = { limit };
      if (category) params.category = category;
      if (item) params.item = item;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const costs = (await makeBuildertrendRequest(
        "/costs/historical",
        params,
        context,
      )) as BuildertrendCost[];

      // Calculate average costs by category/item
      const averages = costs.reduce(
        (acc, cost) => {
          const key = `${cost.category}-${cost.item}`;
          if (!acc[key]) {
            acc[key] = { total: 0, count: 0, unitPrices: [] };
          }
          acc[key].total += cost.totalPrice;
          acc[key].count += 1;
          acc[key].unitPrices.push(cost.unitPrice);
          return acc;
        },
        {} as Record<
          string,
          { total: number; count: number; unitPrices: number[] }
        >,
      );

      // Calculate averages and ranges
      const summary = Object.entries(averages).map(([key, data]) => {
        const [category, item] = key.split("-");
        const avgUnitPrice =
          data.unitPrices.reduce((a, b) => a + b, 0) / data.unitPrices.length;
        const minUnitPrice = Math.min(...data.unitPrices);
        const maxUnitPrice = Math.max(...data.unitPrices);

        return {
          category,
          item,
          averageUnitPrice: avgUnitPrice,
          minUnitPrice,
          maxUnitPrice,
          totalRecords: data.count,
          totalSpent: data.total,
        };
      });

      return {
        success: true,
        data: {
          costs,
          summary,
          count: costs.length,
        },
      };
    } catch (error) {
      logger.error("Error fetching Buildertrend historical costs:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};

// Export all Buildertrend tools
export const buildertrendTools = {
  getJob: getBuildertrendJobTool,
  searchJobs: searchBuildertrendJobsTool,
  getHistoricalCosts: getBuildertrendHistoricalCostsTool,
};

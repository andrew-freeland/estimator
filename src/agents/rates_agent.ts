// @module: rates_agent
// Rates Agent for Estimator Assistant MCP
// Retrieves labor rates, material costs, schedule data, and location modifiers

import "server-only";
import { vectorStore } from "lib/gcp/db";
import { buildertrendTools } from "mcp/buildertrend";
import { googleWorkspaceTools } from "mcp/google";
import { mapsTools } from "mcp/maps";
import logger from "lib/logger";

// Types for rates and cost data
interface LaborRate {
  category: string;
  skill: string;
  hourlyRate: number;
  overtimeRate?: number;
  region: string;
  effectiveDate: string;
  source: string;
}

interface MaterialCost {
  item: string;
  category: string;
  unit: string;
  unitPrice: number;
  supplier: string;
  region: string;
  effectiveDate: string;
  source: string;
}

interface ScheduleData {
  task: string;
  estimatedHours: number;
  skillRequired: string;
  dependencies: string[];
  seasonality?: {
    month: number;
    modifier: number;
  }[];
}

interface LocationModifier {
  address: string;
  coordinates: { lat: number; lng: number };
  modifiers: {
    urbanRural: number;
    costOfLiving: number;
    accessibility: number;
    total: number;
  };
  region: string;
}

interface RatesRequest {
  clientId: string;
  jobId?: string;
  location?: string;
  categories?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
}

interface RatesResult {
  success: boolean;
  data?: {
    laborRates: LaborRate[];
    materialCosts: MaterialCost[];
    scheduleData: ScheduleData[];
    locationModifiers?: LocationModifier;
  };
  error?: string;
}

export class RatesAgent {
  private static instance: RatesAgent;

  private constructor() {}

  public static getInstance(): RatesAgent {
    if (!RatesAgent.instance) {
      RatesAgent.instance = new RatesAgent();
    }
    return RatesAgent.instance;
  }

  /**
   * Main method to retrieve all relevant rates and cost data
   */
  async getRates(request: RatesRequest): Promise<RatesResult> {
    try {
      logger.info(`Retrieving rates for client ${request.clientId}`);

      const [laborRates, materialCosts, scheduleData, locationModifiers] = await Promise.all([
        this.getLaborRates(request),
        this.getMaterialCosts(request),
        this.getScheduleData(request),
        request.location ? this.getLocationModifiers(request.location) : Promise.resolve(null),
      ]);

      return {
        success: true,
        data: {
          laborRates,
          materialCosts,
          scheduleData,
          locationModifiers: locationModifiers || undefined,
        },
      };
    } catch (error) {
      logger.error("Error retrieving rates:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get labor rates from multiple sources
   */
  private async getLaborRates(request: RatesRequest): Promise<LaborRate[]> {
    const rates: LaborRate[] = [];

    try {
      // Get rates from Buildertrend historical data
      if (request.jobId) {
        const buildertrendResult = await buildertrendTools.getHistoricalCosts.execute({
          category: "Labor",
          startDate: request.dateRange?.start,
          endDate: request.dateRange?.end,
          limit: 100,
        });

        if (buildertrendResult.success && buildertrendResult.data?.summary) {
          buildertrendResult.data.summary.forEach(item => {
            if (item.category === "Labor") {
              rates.push({
                category: "Labor",
                skill: item.item,
                hourlyRate: item.averageUnitPrice,
                region: "Unknown",
                effectiveDate: new Date().toISOString(),
                source: "Buildertrend",
              });
            }
          });
        }
      }

      // Get rates from Google Sheets (if configured)
      const sheetRates = await this.getRatesFromGoogleSheets(request);
      rates.push(...sheetRates);

      // Get rates from vector store (previously ingested data)
      const vectorRates = await this.getRatesFromVectorStore(request);
      rates.push(...vectorRates);

      // Apply default rates if no data found
      if (rates.length === 0) {
        rates.push(...this.getDefaultLaborRates());
      }

      return rates;
    } catch (error) {
      logger.error("Error getting labor rates:", error);
      return this.getDefaultLaborRates();
    }
  }

  /**
   * Get material costs from multiple sources
   */
  private async getMaterialCosts(request: RatesRequest): Promise<MaterialCost[]> {
    const costs: MaterialCost[] = [];

    try {
      // Get costs from Buildertrend historical data
      if (request.jobId) {
        const buildertrendResult = await buildertrendTools.getHistoricalCosts.execute({
          category: "Materials",
          startDate: request.dateRange?.start,
          endDate: request.dateRange?.end,
          limit: 100,
        });

        if (buildertrendResult.success && buildertrendResult.data?.summary) {
          buildertrendResult.data.summary.forEach(item => {
            if (item.category === "Materials") {
              costs.push({
                item: item.item,
                category: "Materials",
                unit: "each", // Default unit
                unitPrice: item.averageUnitPrice,
                supplier: "Unknown",
                region: "Unknown",
                effectiveDate: new Date().toISOString(),
                source: "Buildertrend",
              });
            }
          });
        }
      }

      // Get costs from Google Sheets
      const sheetCosts = await this.getMaterialCostsFromGoogleSheets(request);
      costs.push(...sheetCosts);

      // Get costs from vector store
      const vectorCosts = await this.getMaterialCostsFromVectorStore(request);
      costs.push(...vectorCosts);

      // Apply default costs if no data found
      if (costs.length === 0) {
        costs.push(...this.getDefaultMaterialCosts());
      }

      return costs;
    } catch (error) {
      logger.error("Error getting material costs:", error);
      return this.getDefaultMaterialCosts();
    }
  }

  /**
   * Get schedule data and task estimates
   */
  private async getScheduleData(request: RatesRequest): Promise<ScheduleData[]> {
    const scheduleData: ScheduleData[] = [];

    try {
      // Get schedule from Buildertrend
      if (request.jobId) {
        const jobResult = await buildertrendTools.getJob.execute({
          jobId: request.jobId,
          includeSchedule: true,
          includeCosts: false,
        });

        if (jobResult.success && jobResult.data?.schedule) {
          jobResult.data.schedule.forEach((task: any) => {
            scheduleData.push({
              task: task.taskName,
              estimatedHours: task.estimatedHours || 8, // Default 8 hours
              skillRequired: task.assignedTo || "General",
              dependencies: [], // Would need to parse from Buildertrend data
            });
          });
        }
      }

      // Get schedule from vector store
      const vectorSchedule = await this.getScheduleFromVectorStore(request);
      scheduleData.push(...vectorSchedule);

      // Apply default schedule if no data found
      if (scheduleData.length === 0) {
        scheduleData.push(...this.getDefaultScheduleData());
      }

      return scheduleData;
    } catch (error) {
      logger.error("Error getting schedule data:", error);
      return this.getDefaultScheduleData();
    }
  }

  /**
   * Get location-based cost modifiers
   */
  private async getLocationModifiers(location: string): Promise<LocationModifier | null> {
    try {
      const result = await mapsTools.calculateLocationCostModifiers.execute({
        address: location,
      });

      if (result.success && result.data) {
        return {
          address: result.data.address,
          coordinates: result.data.coordinates,
          modifiers: result.data.modifiers,
          region: result.data.state || "Unknown",
        };
      }

      return null;
    } catch (error) {
      logger.error("Error getting location modifiers:", error);
      return null;
    }
  }

  /**
   * Get rates from Google Sheets
   */
  private async getRatesFromGoogleSheets(request: RatesRequest): Promise<LaborRate[]> {
    // This would search for and read from Google Sheets containing rate data
    // For now, return empty array
    return [];
  }

  /**
   * Get material costs from Google Sheets
   */
  private async getMaterialCostsFromGoogleSheets(request: RatesRequest): Promise<MaterialCost[]> {
    // This would search for and read from Google Sheets containing cost data
    // For now, return empty array
    return [];
  }

  /**
   * Get rates from vector store
   */
  private async getRatesFromVectorStore(request: RatesRequest): Promise<LaborRate[]> {
    try {
      // Search for labor rate documents in vector store
      const results = await vectorStore.searchSimilar({
        clientId: request.clientId,
        jobId: request.jobId,
        queryEmbedding: await this.generateQueryEmbedding("labor rates hourly wages construction"),
        limit: 10,
      });

      // Parse results to extract rate information
      const rates: LaborRate[] = [];
      results.forEach((result: any) => {
        // This would parse the content to extract rate information
        // For now, return empty array
      });

      return rates;
    } catch (error) {
      logger.error("Error getting rates from vector store:", error);
      return [];
    }
  }

  /**
   * Get material costs from vector store
   */
  private async getMaterialCostsFromVectorStore(request: RatesRequest): Promise<MaterialCost[]> {
    try {
      // Search for material cost documents in vector store
      const results = await vectorStore.searchSimilar({
        clientId: request.clientId,
        jobId: request.jobId,
        queryEmbedding: await this.generateQueryEmbedding("material costs pricing construction supplies"),
        limit: 10,
      });

      // Parse results to extract cost information
      const costs: MaterialCost[] = [];
      results.forEach((result: any) => {
        // This would parse the content to extract cost information
        // For now, return empty array
      });

      return costs;
    } catch (error) {
      logger.error("Error getting material costs from vector store:", error);
      return [];
    }
  }

  /**
   * Get schedule data from vector store
   */
  private async getScheduleFromVectorStore(request: RatesRequest): Promise<ScheduleData[]> {
    try {
      // Search for schedule documents in vector store
      const results = await vectorStore.searchSimilar({
        clientId: request.clientId,
        jobId: request.jobId,
        queryEmbedding: await this.generateQueryEmbedding("schedule timeline construction tasks"),
        limit: 10,
      });

      // Parse results to extract schedule information
      const schedule: ScheduleData[] = [];
      results.forEach((result: any) => {
        // This would parse the content to extract schedule information
        // For now, return empty array
      });

      return schedule;
    } catch (error) {
      logger.error("Error getting schedule from vector store:", error);
      return [];
    }
  }

  /**
   * Generate query embedding for vector search
   */
  private async generateQueryEmbedding(query: string): Promise<number[]> {
    // This would use the same embedding model as the ingestion agent
    // For now, return a placeholder
    return new Array(3072).fill(0);
  }

  /**
   * Default labor rates (fallback)
   */
  private getDefaultLaborRates(): LaborRate[] {
    return [
      {
        category: "Labor",
        skill: "General Laborer",
        hourlyRate: 25,
        overtimeRate: 37.5,
        region: "National Average",
        effectiveDate: new Date().toISOString(),
        source: "Default",
      },
      {
        category: "Labor",
        skill: "Skilled Tradesperson",
        hourlyRate: 45,
        overtimeRate: 67.5,
        region: "National Average",
        effectiveDate: new Date().toISOString(),
        source: "Default",
      },
      {
        category: "Labor",
        skill: "Project Manager",
        hourlyRate: 75,
        overtimeRate: 112.5,
        region: "National Average",
        effectiveDate: new Date().toISOString(),
        source: "Default",
      },
    ];
  }

  /**
   * Default material costs (fallback)
   */
  private getDefaultMaterialCosts(): MaterialCost[] {
    return [
      {
        item: "2x4 Lumber",
        category: "Materials",
        unit: "linear foot",
        unitPrice: 3.50,
        supplier: "Local Supplier",
        region: "National Average",
        effectiveDate: new Date().toISOString(),
        source: "Default",
      },
      {
        item: "Concrete",
        category: "Materials",
        unit: "cubic yard",
        unitPrice: 120,
        supplier: "Local Supplier",
        region: "National Average",
        effectiveDate: new Date().toISOString(),
        source: "Default",
      },
    ];
  }

  /**
   * Default schedule data (fallback)
   */
  private getDefaultScheduleData(): ScheduleData[] {
    return [
      {
        task: "Site Preparation",
        estimatedHours: 16,
        skillRequired: "General Laborer",
        dependencies: [],
      },
      {
        task: "Foundation Work",
        estimatedHours: 40,
        skillRequired: "Skilled Tradesperson",
        dependencies: ["Site Preparation"],
      },
      {
        task: "Framing",
        estimatedHours: 80,
        skillRequired: "Skilled Tradesperson",
        dependencies: ["Foundation Work"],
      },
    ];
  }
}

// Export singleton instance
export const ratesAgent = RatesAgent.getInstance();

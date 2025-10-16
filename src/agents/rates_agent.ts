// @module: rates_agent
// Rates Agent for Estimator Assistant MCP
// Retrieves labor rates, material costs, schedule data, and location modifiers
// from manually uploaded documents (Buildertrend reports, cost sheets, etc.)
// and Google Sheets integration

import "server-only";
import { vectorStore } from "@/lib/gcp/db";
import logger from "@/lib/logger";

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

      const [laborRates, materialCosts, scheduleData, locationModifiers] =
        await Promise.all([
          this.getLaborRates(request),
          this.getMaterialCosts(request),
          this.getScheduleData(request),
          request.location
            ? this.getLocationModifiers(request.location)
            : Promise.resolve(null),
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
      // Get rates from vector store (previously ingested documents)
      // This includes manually uploaded Buildertrend reports, labor rate sheets, etc.
      const vectorRates = await this.getRatesFromVectorStore(request);
      rates.push(...vectorRates);

      // Get rates from Google Sheets (if configured)
      const sheetRates = await this.getRatesFromGoogleSheets(request);
      rates.push(...sheetRates);

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
  private async getMaterialCosts(
    request: RatesRequest,
  ): Promise<MaterialCost[]> {
    const costs: MaterialCost[] = [];

    try {
      // Get costs from vector store (previously ingested documents)
      // This includes manually uploaded Buildertrend reports, material cost sheets, supplier quotes, etc.
      const vectorCosts = await this.getMaterialCostsFromVectorStore(request);
      costs.push(...vectorCosts);

      // Get costs from Google Sheets
      const sheetCosts = await this.getMaterialCostsFromGoogleSheets(request);
      costs.push(...sheetCosts);

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
  private async getScheduleData(
    request: RatesRequest,
  ): Promise<ScheduleData[]> {
    const scheduleData: ScheduleData[] = [];

    try {
      // Get schedule from vector store (previously ingested documents)
      // This includes manually uploaded Buildertrend reports, project schedules, task breakdowns, etc.
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
  private async getLocationModifiers(
    location: string,
  ): Promise<LocationModifier | null> {
    try {
      // Search vector store for location-specific cost data
      // This includes manually uploaded regional cost reports, location-based pricing sheets, etc.
      const results = await vectorStore.searchSimilar({
        clientId: "system", // Use system-wide location data
        queryEmbedding: await this.generateQueryEmbedding(
          `location cost modifiers ${location} regional pricing`,
        ),
        limit: 5,
      });

      // Parse results to extract location modifier information
      if (results.length > 0) {
        // This would parse the content to extract location modifier information
        // For now, return a placeholder based on location
        return {
          address: location,
          coordinates: { lat: 0, lng: 0 }, // Would be extracted from document
          modifiers: {
            urbanRural: 1.0,
            costOfLiving: 1.0,
            accessibility: 1.0,
            total: 1.0,
          },
          region: "Unknown",
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
  private async getRatesFromGoogleSheets(
    _request: RatesRequest,
  ): Promise<LaborRate[]> {
    // This would search for and read from Google Sheets containing rate data
    // For now, return empty array
    return [];
  }

  /**
   * Get material costs from Google Sheets
   */
  private async getMaterialCostsFromGoogleSheets(
    _request: RatesRequest,
  ): Promise<MaterialCost[]> {
    // This would search for and read from Google Sheets containing cost data
    // For now, return empty array
    return [];
  }

  /**
   * Get rates from vector store
   */
  private async getRatesFromVectorStore(
    request: RatesRequest,
  ): Promise<LaborRate[]> {
    try {
      // Search for labor rate documents in vector store
      const results = await vectorStore.searchSimilar({
        clientId: request.clientId,
        jobId: request.jobId,
        queryEmbedding: await this.generateQueryEmbedding(
          "labor rates hourly wages construction payroll",
        ),
        limit: 10,
      });

      // Parse results to extract rate information
      const rates: LaborRate[] = [];
      results.forEach((result: any) => {
        // In a real implementation, this would use AI to parse the document content
        // and extract structured labor rate information
        // For now, we'll create placeholder rates based on document content
        if (
          (result.content && result.content.includes("labor")) ||
          result.content.includes("wage")
        ) {
          rates.push({
            category: "Labor",
            skill: "General Laborer",
            hourlyRate: 25,
            overtimeRate: 37.5,
            region: "Document-based",
            effectiveDate: new Date().toISOString(),
            source: `Document: ${result.source || "Unknown"}`,
          });
        }
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
  private async getMaterialCostsFromVectorStore(
    request: RatesRequest,
  ): Promise<MaterialCost[]> {
    try {
      // Search for material cost documents in vector store
      const results = await vectorStore.searchSimilar({
        clientId: request.clientId,
        jobId: request.jobId,
        queryEmbedding: await this.generateQueryEmbedding(
          "material costs pricing construction supplies materials",
        ),
        limit: 10,
      });

      // Parse results to extract cost information
      const costs: MaterialCost[] = [];
      results.forEach((result: any) => {
        // In a real implementation, this would use AI to parse the document content
        // and extract structured material cost information
        // For now, we'll create placeholder costs based on document content
        if (
          result.content &&
          (result.content.includes("material") ||
            result.content.includes("cost"))
        ) {
          costs.push({
            item: "Construction Materials",
            category: "Materials",
            unit: "each",
            unitPrice: 100,
            supplier: "Document-based",
            region: "Document-based",
            effectiveDate: new Date().toISOString(),
            source: `Document: ${result.source || "Unknown"}`,
          });
        }
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
  private async getScheduleFromVectorStore(
    request: RatesRequest,
  ): Promise<ScheduleData[]> {
    try {
      // Search for schedule documents in vector store
      const results = await vectorStore.searchSimilar({
        clientId: request.clientId,
        jobId: request.jobId,
        queryEmbedding: await this.generateQueryEmbedding(
          "schedule timeline construction tasks project phases",
        ),
        limit: 10,
      });

      // Parse results to extract schedule information
      const schedule: ScheduleData[] = [];
      results.forEach((result: any) => {
        // In a real implementation, this would use AI to parse the document content
        // and extract structured schedule information
        // For now, we'll create placeholder schedule data based on document content
        if (
          result.content &&
          (result.content.includes("schedule") ||
            result.content.includes("timeline"))
        ) {
          schedule.push({
            task: "Document-based Task",
            estimatedHours: 8,
            skillRequired: "General",
            dependencies: [],
          });
        }
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
  private async generateQueryEmbedding(_query: string): Promise<number[]> {
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
        unitPrice: 3.5,
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

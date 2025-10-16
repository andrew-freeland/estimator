// @module: explainer_agent
// Explainer Agent for Estimator Assistant MCP
// Produces reasoning, uncertainty analysis, and confidence narratives for estimates

import "server-only";
import { openai } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { vectorStore } from "@/lib/gcp/db";
import { ratesAgent } from "./rates_agent";
import logger from "@/lib/logger";

// EA_ prefix for Estimator Assistant
const EA_EXPLAINER_MODEL = process.env.EA_EXPLAINER_MODEL || "gpt-4o";

// Schemas for structured output
const EstimateBreakdownSchema = z.object({
  categories: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      cost: z.number(),
      confidence: z.number().min(0).max(1),
      assumptions: z.array(z.string()),
      dataSources: z.array(z.string()),
    }),
  ),
  totalCost: z.number(),
  overallConfidence: z.number().min(0).max(1),
  riskFactors: z.array(
    z.object({
      factor: z.string(),
      impact: z.enum(["low", "medium", "high"]),
      probability: z.number().min(0).max(1),
      mitigation: z.string(),
    }),
  ),
  recommendations: z.array(z.string()),
});

const UncertaintyAnalysisSchema = z.object({
  highConfidence: z.array(z.string()),
  mediumConfidence: z.array(z.string()),
  lowConfidence: z.array(z.string()),
  missingData: z.array(z.string()),
  alternativeScenarios: z.array(
    z.object({
      scenario: z.string(),
      cost: z.number(),
      probability: z.number().min(0).max(1),
    }),
  ),
});

// Types for estimate explanation
interface EstimateRequest {
  clientId: string;
  jobId?: string;
  projectDescription: string;
  location?: string;
  timeline?: string;
  scope?: string[];
  constraints?: string[];
}

interface EstimateResult {
  success: boolean;
  data?: {
    estimate: number;
    confidence: number;
    reasoning: string[];
    sources: string[];
    breakdown: z.infer<typeof EstimateBreakdownSchema>;
    uncertainty: z.infer<typeof UncertaintyAnalysisSchema>;
    narrative: string;
    sourceDetails: Array<{
      type: string;
      content: string;
      relevance: number;
      source: string;
    }>;
  };
  error?: string;
}

export class ExplainerAgent {
  private static instance: ExplainerAgent;

  private constructor() {}

  public static getInstance(): ExplainerAgent {
    if (!ExplainerAgent.instance) {
      ExplainerAgent.instance = new ExplainerAgent();
    }
    return ExplainerAgent.instance;
  }

  /**
   * Main method to generate comprehensive estimate explanation
   */
  async explainEstimate(request: EstimateRequest): Promise<EstimateResult> {
    try {
      logger.info(
        `Generating estimate explanation for client ${request.clientId}`,
      );

      // Gather relevant data
      const [relevantData, ratesData] = await Promise.all([
        this.gatherRelevantData(request),
        ratesAgent.getRates({
          clientId: request.clientId,
          jobId: request.jobId,
          location: request.location,
        }),
      ]);

      // Generate structured estimate breakdown
      const breakdown = await this.generateEstimateBreakdown(
        request,
        relevantData,
        ratesData,
      );

      // Analyze uncertainty
      const uncertainty = await this.analyzeUncertainty(
        request,
        relevantData,
        ratesData,
      );

      // Generate narrative explanation
      const narrative = await this.generateNarrative(
        request,
        breakdown,
        uncertainty,
        relevantData,
      );

      // Extract final estimate and confidence
      const estimate = breakdown.totalCost;
      const confidence = breakdown.overallConfidence;
      const reasoning = breakdown.categories.map(
        (cat) =>
          `${cat.name}: $${cat.cost.toLocaleString()} (${(cat.confidence * 100).toFixed(1)}% confidence)`,
      );
      const sources = relevantData.map((source) => source.source);

      return {
        success: true,
        data: {
          estimate,
          confidence,
          reasoning,
          sources,
          breakdown,
          uncertainty,
          narrative,
          sourceDetails: relevantData,
        },
      };
    } catch (error) {
      logger.error("Error generating estimate explanation:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Gather relevant data from vector store and external sources
   */
  private async gatherRelevantData(request: EstimateRequest): Promise<
    Array<{
      type: string;
      content: string;
      relevance: number;
      source: string;
    }>
  > {
    const sources: Array<{
      type: string;
      content: string;
      relevance: number;
      source: string;
    }> = [];

    try {
      // Search vector store for relevant documents
      const searchQueries = [
        request.projectDescription,
        ...(request.scope || []),
        ...(request.constraints || []),
      ];

      for (const query of searchQueries) {
        const results = await vectorStore.searchSimilar({
          clientId: request.clientId,
          jobId: request.jobId,
          queryEmbedding: await this.generateQueryEmbedding(query),
          limit: 5,
        });

        results.forEach((result: any) => {
          sources.push({
            type: "document",
            content: result.content,
            relevance: result.similarity,
            source: result.source_path,
          });
        });
      }

      // Sort by relevance
      sources.sort((a, b) => b.relevance - a.relevance);

      return sources.slice(0, 20); // Limit to top 20 most relevant sources
    } catch (error) {
      logger.error("Error gathering relevant data:", error);
      return [];
    }
  }

  /**
   * Generate structured estimate breakdown
   */
  private async generateEstimateBreakdown(
    request: EstimateRequest,
    relevantData: Array<{
      type: string;
      content: string;
      relevance: number;
      source: string;
    }>,
    ratesData: any,
  ): Promise<z.infer<typeof EstimateBreakdownSchema>> {
    try {
      const prompt = `
You are an expert construction estimator. Generate a detailed cost breakdown for the following project:

Project Description: ${request.projectDescription}
Location: ${request.location || "Not specified"}
Timeline: ${request.timeline || "Not specified"}
Scope: ${request.scope?.join(", ") || "Not specified"}
Constraints: ${request.constraints?.join(", ") || "None specified"}

Available Data Sources:
${relevantData.map((source) => `- ${source.type}: ${source.content.substring(0, 200)}... (relevance: ${source.relevance.toFixed(2)})`).join("\n")}

Available Rates:
Labor Rates: ${ratesData.data?.laborRates?.map((rate: any) => `${rate.skill}: $${rate.hourlyRate}/hour`).join(", ") || "Default rates"}
Material Costs: ${ratesData.data?.materialCosts?.map((cost: any) => `${cost.item}: $${cost.unitPrice}/${cost.unit}`).join(", ") || "Default costs"}

Generate a comprehensive cost breakdown with:
1. Categories (Labor, Materials, Equipment, Overhead, etc.)
2. Cost estimates for each category
3. Confidence levels (0-1) based on available data
4. Key assumptions made
5. Data sources used
6. Risk factors and their impact
7. Recommendations for improving the estimate

Be realistic about uncertainty and clearly state assumptions.
`;

      const result = await generateObject({
        model: openai(EA_EXPLAINER_MODEL),
        schema: EstimateBreakdownSchema,
        prompt,
        temperature: 0.3,
      });

      return result.object;
    } catch (error) {
      logger.error("Error generating estimate breakdown:", error);
      throw error;
    }
  }

  /**
   * Analyze uncertainty in the estimate
   */
  private async analyzeUncertainty(
    request: EstimateRequest,
    relevantData: Array<{
      type: string;
      content: string;
      relevance: number;
      source: string;
    }>,
    _ratesData: any,
  ): Promise<z.infer<typeof UncertaintyAnalysisSchema>> {
    try {
      const prompt = `
Analyze the uncertainty in this construction estimate:

Project: ${request.projectDescription}
Available Data: ${relevantData.length} sources with average relevance of ${relevantData.reduce((sum, s) => sum + s.relevance, 0) / relevantData.length}

Identify:
1. High confidence elements (well-documented, similar projects)
2. Medium confidence elements (some data available, reasonable assumptions)
3. Low confidence elements (limited data, high uncertainty)
4. Missing data that would improve the estimate
5. Alternative scenarios (best case, worst case, most likely)

Consider factors like:
- Data quality and relevance
- Market volatility
- Project complexity
- Location-specific factors
- Timeline constraints
- Scope clarity

Provide realistic probability assessments for alternative scenarios.
`;

      const result = await generateObject({
        model: openai(EA_EXPLAINER_MODEL),
        schema: UncertaintyAnalysisSchema,
        prompt,
        temperature: 0.2,
      });

      return result.object;
    } catch (error) {
      logger.error("Error analyzing uncertainty:", error);
      throw error;
    }
  }

  /**
   * Generate narrative explanation
   */
  private async generateNarrative(
    request: EstimateRequest,
    breakdown: z.infer<typeof EstimateBreakdownSchema>,
    uncertainty: z.infer<typeof UncertaintyAnalysisSchema>,
    _relevantData: Array<{
      type: string;
      content: string;
      relevance: number;
      source: string;
    }>,
  ): Promise<string> {
    try {
      const prompt = `
Write a comprehensive narrative explanation for this construction estimate:

Project: ${request.projectDescription}
Total Cost: $${breakdown.totalCost.toLocaleString()}
Overall Confidence: ${(breakdown.overallConfidence * 100).toFixed(1)}%

Cost Breakdown:
${breakdown.categories
  .map(
    (cat) =>
      `- ${cat.name}: $${cat.cost.toLocaleString()} (${(cat.confidence * 100).toFixed(1)}% confidence)`,
  )
  .join("\n")}

Uncertainty Analysis:
- High Confidence: ${uncertainty.highConfidence.join(", ")}
- Medium Confidence: ${uncertainty.mediumConfidence.join(", ")}
- Low Confidence: ${uncertainty.lowConfidence.join(", ")}
- Missing Data: ${uncertainty.missingData.join(", ")}

Risk Factors:
${breakdown.riskFactors
  .map(
    (risk) =>
      `- ${risk.factor}: ${risk.impact} impact, ${(risk.probability * 100).toFixed(1)}% probability`,
  )
  .join("\n")}

Write a clear, professional narrative that:
1. Explains the estimate methodology
2. Highlights key assumptions and their rationale
3. Discusses confidence levels and uncertainty
4. Identifies the most significant risk factors
5. Provides actionable recommendations
6. Explains how the estimate could be improved

Use a professional but accessible tone. Be honest about limitations and uncertainty.
`;

      const response = await generateText({
        model: openai(EA_EXPLAINER_MODEL),
        prompt,
        maxOutputTokens: 2000,
        temperature: 0.3,
      });

      return response.text || "Unable to generate narrative";
    } catch (error) {
      logger.error("Error generating narrative:", error);
      return "Error generating narrative explanation";
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
   * Generate estimate comparison with historical data
   */
  async compareWithHistorical(
    request: EstimateRequest,
    _currentEstimate: z.infer<typeof EstimateBreakdownSchema>,
  ): Promise<{
    similarProjects: Array<{
      project: string;
      cost: number;
      similarity: number;
      differences: string[];
    }>;
    marketTrends: string[];
    recommendations: string[];
  }> {
    try {
      // Search for similar historical projects
      const historicalResults = await vectorStore.searchSimilar({
        clientId: request.clientId,
        queryEmbedding: await this.generateQueryEmbedding(
          request.projectDescription,
        ),
        limit: 10,
      });

      const similarProjects = historicalResults.map((result: any) => ({
        project: result.source_path,
        cost: 0, // Would extract from historical data
        similarity: result.similarity,
        differences: [], // Would analyze differences
      }));

      return {
        similarProjects,
        marketTrends: [
          "Material costs increasing 5% annually",
          "Labor shortage affecting rates",
        ],
        recommendations: [
          "Consider bulk material purchasing",
          "Plan for potential delays due to labor constraints",
          "Review estimate quarterly for market changes",
        ],
      };
    } catch (error) {
      logger.error("Error comparing with historical data:", error);
      return {
        similarProjects: [],
        marketTrends: [],
        recommendations: [],
      };
    }
  }
}

// Export singleton instance
export const explainerAgent = ExplainerAgent.getInstance();

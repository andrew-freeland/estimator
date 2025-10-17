// @module: vectorstore
// Vector store module for Estimator Assistant MCP
// Provides embedding generation, storage, and retrieval for RAG

import "server-only";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { vectorStore } from "@/lib/gcp/db";
import { config } from "@/lib/config";
import logger from "@/lib/logger";

// Types for vector operations
interface EmbeddingRequest {
  text: string;
  metadata?: Record<string, any>;
}

interface EmbeddingResult {
  embedding: number[];
  text: string;
  metadata?: Record<string, any>;
}

interface SearchRequest {
  query: string;
  clientId: string;
  jobId?: string;
  limit?: number;
  threshold?: number;
}

interface SearchResult {
  id: string;
  content: string;
  metadata: Record<string, any>;
  similarity: number;
  source: string;
}

export class VectorStoreService {
  private static instance: VectorStoreService;

  private constructor() {}

  public static getInstance(): VectorStoreService {
    if (!VectorStoreService.instance) {
      VectorStoreService.instance = new VectorStoreService();
    }
    return VectorStoreService.instance;
  }

  /**
   * Generate embedding for text content
   */
  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResult> {
    try {
      logger.info(
        `Generating embedding for text (${request.text.length} chars)`,
      );

      const { embedding } = await embed({
        model: openai.embedding(config.EA_EMBEDDING_MODEL),
        value: request.text,
      });

      return {
        embedding,
        text: request.text,
        metadata: request.metadata,
      };
    } catch (error) {
      logger.error("Error generating embedding:", error);
      throw new Error("Failed to generate embedding");
    }
  }

  /**
   * Store embedding in vector database
   */
  async storeEmbedding(params: {
    clientId: string;
    jobId?: string;
    sourcePath: string;
    sourceType: "file" | "transcript" | "text";
    content: string;
    metadata?: Record<string, any>;
  }) {
    try {
      // Generate embedding
      const embeddingResult = await this.generateEmbedding({
        text: params.content,
        metadata: params.metadata,
      });

      // Store in vector database
      await vectorStore.storeEmbedding({
        clientId: params.clientId,
        jobId: params.jobId,
        sourcePath: params.sourcePath,
        sourceType: params.sourceType,
        content: params.content,
        embedding: embeddingResult.embedding,
        metadata: {
          ...params.metadata,
          ...embeddingResult.metadata,
        },
      });

      logger.info(`Stored embedding for ${params.sourcePath}`);
      return embeddingResult;
    } catch (error) {
      logger.error("Error storing embedding:", error);
      throw error;
    }
  }

  /**
   * Search for similar content using vector similarity
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    try {
      logger.info(`Searching vector store for: ${request.query}`);

      // Generate embedding for search query
      const queryEmbedding = await this.generateEmbedding({
        text: request.query,
      });

      // Search vector database
      const results = await vectorStore.searchSimilar({
        clientId: request.clientId,
        jobId: request.jobId,
        queryEmbedding: queryEmbedding.embedding,
        limit: request.limit || 10,
        threshold: request.threshold || 0.7,
      });

      // Transform results
      return results.map((result: any) => ({
        id: result.id,
        content: result.content,
        metadata: result.metadata || {},
        similarity: result.similarity,
        source: result.source_path,
      }));
    } catch (error) {
      logger.error("Error searching vector store:", error);
      throw error;
    }
  }

  /**
   * Batch store multiple embeddings
   */
  async batchStoreEmbeddings(
    requests: Array<{
      clientId: string;
      jobId?: string;
      sourcePath: string;
      sourceType: "file" | "transcript" | "text";
      content: string;
      metadata?: Record<string, any>;
    }>,
  ) {
    // Research-backed fix: TypeScript inference pitfall - explicitly type array to avoid never[] inference
    const results: EmbeddingResult[] = [];

    // Process in batches to avoid overwhelming the API
    const batchSize = 10; // Stack compliance update: Use fixed batch size
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((request) => this.storeEmbedding(request)),
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Delete embeddings by source path or client
   */
  async deleteEmbeddings(params: {
    clientId: string;
    sourcePath?: string;
    jobId?: string;
  }) {
    try {
      await vectorStore.deleteEmbeddings(params);
      logger.info(`Deleted embeddings for client ${params.clientId}`);
    } catch (error) {
      logger.error("Error deleting embeddings:", error);
      throw error;
    }
  }

  /**
   * Get embedding statistics
   */
  async getStats(clientId: string) {
    try {
      return await vectorStore.getStats(clientId);
    } catch (error) {
      logger.error("Error getting embedding stats:", error);
      throw error;
    }
  }

  /**
   * Initialize vector store (create tables and indexes)
   */
  async initialize() {
    try {
      await vectorStore.initializeVectorStore();
      logger.info("Vector store initialized successfully");
    } catch (error) {
      logger.error("Error initializing vector store:", error);
      throw error;
    }
  }

  /**
   * Search for construction-specific content
   */
  async searchConstructionContent(
    request: SearchRequest & {
      categories?: string[];
      projectType?: string;
    },
  ): Promise<SearchResult[]> {
    try {
      // Enhance query with construction-specific terms
      let enhancedQuery = request.query;

      if (request.categories) {
        enhancedQuery += ` ${request.categories.join(" ")}`;
      }

      if (request.projectType) {
        enhancedQuery += ` ${request.projectType} construction project`;
      }

      return this.search({
        ...request,
        query: enhancedQuery,
      });
    } catch (error) {
      logger.error("Error searching construction content:", error);
      throw error;
    }
  }

  /**
   * Search for cost-related content
   */
  async searchCostData(request: SearchRequest): Promise<SearchResult[]> {
    try {
      const costQuery = `${request.query} cost price estimate budget pricing`;
      return this.search({
        ...request,
        query: costQuery,
      });
    } catch (error) {
      logger.error("Error searching cost data:", error);
      throw error;
    }
  }

  /**
   * Search for schedule-related content
   */
  async searchScheduleData(request: SearchRequest): Promise<SearchResult[]> {
    try {
      const scheduleQuery = `${request.query} schedule timeline duration hours days weeks`;
      return this.search({
        ...request,
        query: scheduleQuery,
      });
    } catch (error) {
      logger.error("Error searching schedule data:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const vectorStoreService = VectorStoreService.getInstance();

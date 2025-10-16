// @module: rag_retrieval_api
// RAG Retrieval API endpoint for Estimator Assistant MCP
// Performs pgvector similarity search on documents table

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { withSecurity } from "lib/security";
import { vectorStoreService } from "vectorstore";
import { logToolCall } from "lib/logs";
import { z } from "zod";

// Request validation schema
const RetrieveRequestSchema = z.object({
  query: z.string().min(1).max(1000),
  projectId: z.string().min(1).max(100),
  limit: z.number().min(1).max(50).optional().default(10),
  threshold: z.number().min(0).max(1).optional().default(0.7),
  categories: z.array(z.string()).optional(),
  projectType: z.string().optional(),
});

export async function POST(request: NextRequest) {
  return withSecurity(
    request,
    async (context) => {
      const startTime = Date.now();

      try {
        // Parse and validate request body
        const body = await request.json();
        const validation = RetrieveRequestSchema.safeParse(body);

        if (!validation.success) {
          return NextResponse.json(
            {
              success: false,
              error: "Invalid request parameters",
              details: validation.error.errors,
            },
            { status: 400 },
          );
        }

        const { query, projectId, limit, threshold, categories, projectType } =
          validation.data;

        // Validate project access
        if (projectId !== context.clientId && !context.isAdmin) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Access denied: Project not found or insufficient permissions",
            },
            { status: 403 },
          );
        }

        // Perform vector similarity search
        const searchResults =
          await vectorStoreService.searchConstructionContent({
            query,
            clientId: context.clientId,
            jobId: projectId,
            limit,
            threshold,
            categories,
            projectType,
          });

        const duration = Date.now() - startTime;

        // Log retrieval operation
        logToolCall({
          toolName: "rag_retrieval",
          clientId: context.clientId,
          userId: context.userId,
          sessionId: context.sessionId,
          projectId,
          success: true,
          duration,
          request: {
            query,
            projectId,
            limit,
            threshold,
            categories,
            projectType,
          },
          response: {
            resultCount: searchResults.length,
            avgRelevance:
              searchResults.reduce((sum, r) => sum + r.similarity, 0) /
              searchResults.length,
          },
        });

        // Transform results to match expected format
        const results = searchResults.map((result) => ({
          id: result.id,
          content: result.content,
          relevance: result.similarity,
          source: result.source,
          metadata: result.metadata,
        }));

        return NextResponse.json({
          success: true,
          data: {
            query,
            projectId,
            results,
            count: results.length,
            avgRelevance:
              results.length > 0
                ? results.reduce((sum, r) => sum + r.relevance, 0) /
                  results.length
                : 0,
            searchTime: duration,
          },
        });
      } catch (error) {
        const duration = Date.now() - startTime;

        // Log error
        logToolCall({
          toolName: "rag_retrieval",
          clientId: context.clientId,
          userId: context.userId,
          sessionId: context.sessionId,
          success: false,
          duration,
          error: error instanceof Error ? error.message : "Unknown error",
          request: body,
        });

        return NextResponse.json(
          {
            success: false,
            error: "Retrieval failed",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 },
        );
      }
    },
    ["read:documents"], // Required permissions
  );
}

export async function GET(request: NextRequest) {
  return withSecurity(
    request,
    async (context) => {
      const { searchParams } = new URL(request.url);
      const query = searchParams.get("query");
      const projectId = searchParams.get("projectId");
      const limit = parseInt(searchParams.get("limit") || "10");
      const threshold = parseFloat(searchParams.get("threshold") || "0.7");

      if (!query || !projectId) {
        return NextResponse.json(
          { success: false, error: "query and projectId parameters required" },
          { status: 400 },
        );
      }

      try {
        // Validate project access
        if (projectId !== context.clientId && !context.isAdmin) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Access denied: Project not found or insufficient permissions",
            },
            { status: 403 },
          );
        }

        const startTime = Date.now();

        // Perform vector similarity search
        const searchResults = await vectorStoreService.search({
          query,
          clientId: context.clientId,
          jobId: projectId,
          limit,
          threshold,
        });

        const duration = Date.now() - startTime;

        // Transform results
        const results = searchResults.map((result) => ({
          id: result.id,
          content: result.content,
          relevance: result.similarity,
          source: result.source,
          metadata: result.metadata,
        }));

        return NextResponse.json({
          success: true,
          data: {
            query,
            projectId,
            results,
            count: results.length,
            searchTime: duration,
          },
        });
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error: "Retrieval failed",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 },
        );
      }
    },
    ["read:documents"], // Required permissions
  );
}

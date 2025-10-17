// @module: estimate_api
// Main estimation API endpoint for Estimator Assistant MCP
// Demonstrates end-to-end orchestrator functionality

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { estimatorOrchestrator } from "@/agents/orchestrator";
import { withSecurity } from "@/lib/security";
import { logEstimateGeneration } from "@/lib/logs";
import { z } from "zod";

// Request validation schema
const EstimateRequestSchema = z.object({
  projectDescription: z.string().min(10).max(5000),
  location: z.string().optional(),
  timeline: z.string().optional(),
  scope: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  jobId: z.string().optional(),
  inputFiles: z
    .array(
      z.object({
        path: z.string(),
        type: z.enum(["file", "transcript", "text"]),
        content: z.string().optional(),
        mimeType: z.string().optional(),
      }),
    )
    .optional(),
});

export async function POST(request: NextRequest) {
  return withSecurity(
    request,
    async (context) => {
      const startTime = Date.now();

      try {
        // Parse and validate request body
        const body = await request.json();
        const validation = EstimateRequestSchema.safeParse(body);

        if (!validation.success) {
          return NextResponse.json(
            {
              success: false,
              error: "Invalid request parameters",
              details: validation.error.issues,
            },
            { status: 400 },
          );
        }

        const {
          projectDescription,
          location,
          timeline,
          scope,
          constraints,
          jobId,
          inputFiles,
        } = validation.data;

        // Generate session ID for this estimation request
        const sessionId = `est_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Run orchestration
        const result = await estimatorOrchestrator.orchestrate({
          clientId: context.clientId,
          jobId,
          projectDescription,
          location,
          timeline,
          scope,
          constraints,
          inputFiles,
          userId: context.userId,
          sessionId,
        });

        const duration = Date.now() - startTime;

        // Log estimate generation
        if (result.finalEstimate) {
          logEstimateGeneration({
            clientId: context.clientId,
            userId: context.userId,
            sessionId,
            projectId: result.context.project_id,
            jobId,
            estimate: result.finalEstimate.estimate,
            confidence: result.finalEstimate.confidence,
            success: result.success,
            duration,
            breakdown: result.finalEstimate,
          });
        }

        return NextResponse.json({
          success: result.success,
          data: {
            sessionId,
            context: {
              projectId: result.context.project_id,
              client: result.context.client,
              jobId: result.context.job_id,
            },
            estimate: result.finalEstimate,
            results: result.results,
            totalDuration: result.totalDuration,
          },
          error: result.error,
        });
      } catch (error) {
        const duration = Date.now() - startTime;

        // Log error
        logEstimateGeneration({
          clientId: context.clientId,
          userId: context.userId,
          sessionId: `est_${Date.now()}`,
          projectId: "unknown",
          estimate: 0,
          confidence: 0,
          success: false,
          duration,
          error: error instanceof Error ? error.message : "Unknown error",
        });

        return NextResponse.json(
          {
            success: false,
            error: "Internal server error",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 },
        );
      }
    },
    ["read:estimates", "write:estimates"], // Required permissions
  );
}

export async function GET(request: NextRequest) {
  return withSecurity(
    request,
    async (_context) => {
      const { searchParams } = new URL(request.url);
      const sessionId = searchParams.get("sessionId");
      const projectId = searchParams.get("projectId");

      if (!sessionId && !projectId) {
        return NextResponse.json(
          {
            success: false,
            error: "sessionId or projectId parameter required",
          },
          { status: 400 },
        );
      }

      try {
        // Get orchestration status
        const status = await estimatorOrchestrator.getStatus(sessionId || "");

        return NextResponse.json({
          success: true,
          data: status,
        });
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error: "Failed to get status",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 },
        );
      }
    },
    ["read:estimates"], // Required permissions
  );
}

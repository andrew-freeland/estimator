// @module: voice_upload_api
// Voice upload API endpoint for Estimator Assistant MCP
// Handles audio file uploads, Whisper transcription, and ingestion

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "lib/auth";
import { ingestionAgent } from "agents/ingestion_agent";
import { gcsFileStorage } from "lib/gcp/storage";
import logger from "lib/logger";
import { z } from "zod";

// EA_ prefix for Estimator Assistant
const EA_MAX_AUDIO_SIZE = parseInt(process.env.EA_MAX_AUDIO_SIZE || "25000000"); // 25MB
const EA_ALLOWED_AUDIO_TYPES = [
  "audio/wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/webm",
  "audio/ogg",
];

// Request validation schema
const VoiceUploadSchema = z.object({
  clientId: z.string().min(1),
  jobId: z.string().optional(),
  description: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Parse form data
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;
    const clientId = formData.get("clientId") as string;
    const jobId = formData.get("jobId") as string | null;
    const description = formData.get("description") as string | null;

    // Validate request
    const validation = VoiceUploadSchema.safeParse({
      clientId,
      jobId,
      description,
    });

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

    if (!audioFile) {
      return NextResponse.json(
        { success: false, error: "No audio file provided" },
        { status: 400 },
      );
    }

    // Validate file size
    if (audioFile.size > EA_MAX_AUDIO_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `File too large. Maximum size is ${EA_MAX_AUDIO_SIZE / 1000000}MB`,
        },
        { status: 400 },
      );
    }

    // Validate MIME type
    if (!EA_ALLOWED_AUDIO_TYPES.includes(audioFile.type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported audio type. Allowed types: ${EA_ALLOWED_AUDIO_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    logger.info(
      `Processing voice upload for client ${clientId}, file size: ${audioFile.size} bytes`,
    );

    // Convert file to buffer
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    // Store original audio file in GCS
    const audioStorageResult = await gcsFileStorage.upload(audioBuffer, {
      filename: `voice_${Date.now()}_${audioFile.name}`,
      contentType: audioFile.type,
    });

    // Transcribe audio using Whisper
    const transcriptionResult = await transcribeAudio(
      audioBuffer,
      audioFile.type,
    );

    if (!transcriptionResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Transcription failed",
          details: transcriptionResult.error,
        },
        { status: 500 },
      );
    }

    // Store transcript in GCS
    const transcriptBuffer = Buffer.from(transcriptionResult.text, "utf-8");
    const transcriptStorageResult = await gcsFileStorage.upload(
      transcriptBuffer,
      {
        filename: `transcript_${Date.now()}.txt`,
        contentType: "text/plain",
      },
    );

    // Ingest transcript into vector store
    const ingestionResult = await ingestionAgent.ingest({
      clientId,
      jobId: jobId || undefined,
      sourcePath: transcriptStorageResult.key,
      sourceType: "transcript",
      content: transcriptionResult.text,
      metadata: {
        originalAudioFile: audioStorageResult.key,
        audioFileSize: audioFile.size,
        audioFileType: audioFile.type,
        transcriptionModel: transcriptionResult.model,
        transcriptionLanguage: transcriptionResult.language,
        transcriptionConfidence: transcriptionResult.confidence,
        description: description || undefined,
        uploadedBy: session.user.id,
        uploadedAt: new Date().toISOString(),
      },
    });

    if (!ingestionResult.success) {
      logger.error("Failed to ingest transcript:", ingestionResult.error);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to process transcript",
          details: ingestionResult.error,
        },
        { status: 500 },
      );
    }

    logger.info(`Voice upload processed successfully for client ${clientId}`);

    return NextResponse.json({
      success: true,
      data: {
        audioFile: {
          key: audioStorageResult.key,
          url: audioStorageResult.sourceUrl,
          size: audioFile.size,
          type: audioFile.type,
        },
        transcript: {
          key: transcriptStorageResult.key,
          url: transcriptStorageResult.sourceUrl,
          text: transcriptionResult.text,
          language: transcriptionResult.language,
          confidence: transcriptionResult.confidence,
        },
        ingestion: {
          success: ingestionResult.success,
          content: ingestionResult.content,
          metadata: ingestionResult.metadata,
        },
      },
    });
  } catch (error) {
    logger.error("Voice upload API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * Transcribe audio using OpenAI Whisper API
 */
async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
): Promise<{
  success: boolean;
  text?: string;
  language?: string;
  confidence?: number;
  model?: string;
  error?: string;
}> {
  try {
    // Create FormData for Whisper API
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append("file", blob, "audio.wav");
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("language", "en"); // Default to English, could be detected

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    return {
      success: true,
      text: result.text,
      language: result.language,
      confidence: result.segments
        ? result.segments.reduce(
            (acc: number, seg: any) => acc + (seg.avg_logprob || 0),
            0,
          ) / result.segments.length
        : 0.9, // Default confidence if segments not available
      model: result.model || "whisper-1",
    };
  } catch (error) {
    logger.error("Whisper transcription error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Transcription failed",
    };
  }
}

/**
 * GET endpoint to check voice upload status
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const jobId = searchParams.get("jobId");

    if (!clientId) {
      return NextResponse.json(
        { success: false, error: "clientId parameter required" },
        { status: 400 },
      );
    }

    // This would typically query a status store
    // For now, return a placeholder response
    return NextResponse.json({
      success: true,
      data: {
        clientId,
        jobId,
        status: "ready",
        message: "Voice upload service is operational",
      },
    });
  } catch (error) {
    logger.error("Voice upload status check error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}

// @module: ingestion_agent
// Ingestion Agent for Estimator Assistant MCP
// Handles file parsing, transcription, and embedding generation

import "server-only";
import { openai } from "@ai-sdk/openai";
import { embed, generateText } from "ai";
import { vectorStore } from "@/lib/gcp/db";
import logger from "@/lib/logger";

// EA_ prefix for Estimator Assistant
const EA_EMBEDDING_MODEL =
  process.env.EA_EMBEDDING_MODEL || "text-embedding-3-large";
const EA_TRANSCRIPTION_MODEL =
  process.env.EA_TRANSCRIPTION_MODEL || "whisper-1";

// Types for ingestion processing
interface IngestionRequest {
  clientId: string;
  jobId?: string;
  sourcePath: string;
  sourceType: "file" | "transcript" | "text";
  content?: string; // For text input
  fileBuffer?: Buffer; // For file uploads
  mimeType?: string;
  metadata?: Record<string, any>;
}

interface IngestionResult {
  success: boolean;
  embeddingId?: string;
  content?: string;
  error?: string;
  metadata?: Record<string, any>;
}

interface ParsedContent {
  text: string;
  metadata: {
    wordCount: number;
    language?: string;
    confidence?: number;
    sections?: Array<{
      title: string;
      content: string;
      startIndex: number;
      endIndex: number;
    }>;
  };
}

export class IngestionAgent {
  private static instance: IngestionAgent;

  private constructor() {}

  public static getInstance(): IngestionAgent {
    if (!IngestionAgent.instance) {
      IngestionAgent.instance = new IngestionAgent();
    }
    return IngestionAgent.instance;
  }

  /**
   * Main ingestion method - processes files, transcripts, or text
   */
  async ingest(request: IngestionRequest): Promise<IngestionResult> {
    try {
      logger.info(
        `Starting ingestion for ${request.sourcePath} (${request.sourceType})`,
      );

      let parsedContent: ParsedContent;

      // Process based on source type
      switch (request.sourceType) {
        case "file":
          parsedContent = await this.parseFile(request);
          break;
        case "transcript":
          parsedContent = await this.parseTranscript(request);
          break;
        case "text":
          parsedContent = await this.parseText(request);
          break;
        default:
          throw new Error(`Unsupported source type: ${request.sourceType}`);
      }

      // Generate embedding
      const embedding = await this.generateEmbedding(parsedContent.text);

      // Store in vector database
      await vectorStore.storeEmbedding({
        clientId: request.clientId,
        jobId: request.jobId,
        sourcePath: request.sourcePath,
        sourceType: request.sourceType,
        content: parsedContent.text,
        embedding,
        metadata: {
          ...request.metadata,
          ...parsedContent.metadata,
        },
      });

      logger.info(`Successfully ingested ${request.sourcePath}`);

      return {
        success: true,
        content: parsedContent.text,
        metadata: parsedContent.metadata,
      };
    } catch (error) {
      logger.error(`Failed to ingest ${request.sourcePath}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Parse uploaded files (PDF, DOCX, images, etc.)
   */
  private async parseFile(request: IngestionRequest): Promise<ParsedContent> {
    if (!request.fileBuffer || !request.mimeType) {
      throw new Error("File buffer and MIME type required for file parsing");
    }

    const { fileBuffer, mimeType } = request;

    // Handle different file types
    if (mimeType.startsWith("text/")) {
      return this.parseTextFile(request);
    } else if (mimeType === "application/pdf") {
      return this.parsePDF(fileBuffer);
    } else if (mimeType.includes("word") || mimeType.includes("document")) {
      return this.parseWordDocument(fileBuffer);
    } else if (mimeType.startsWith("image/")) {
      return this.parseImage(fileBuffer);
    } else if (mimeType.includes("audio")) {
      return this.parseAudio(fileBuffer);
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }
  }

  /**
   * Parse text files
   */
  private async parseTextFile(
    request: IngestionRequest,
  ): Promise<ParsedContent> {
    const text = request.fileBuffer!.toString("utf-8");
    return this.parseText({ ...request, content: text });
  }

  /**
   * Parse PDF files using OpenAI's vision capabilities
   */
  private async parsePDF(buffer: Buffer): Promise<ParsedContent> {
    // For now, we'll use a simple approach
    // In production, you might want to use a dedicated PDF parser
    const text = buffer.toString("utf-8");

    // Basic PDF text extraction (this is simplified)
    const cleanText = text
      .replace(/\n\s*\n/g, "\n") // Remove excessive whitespace
      .replace(/[^\x20-\x7E\n\r]/g, "") // Remove non-printable characters
      .trim();

    return {
      text: cleanText,
      metadata: {
        wordCount: cleanText.split(/\s+/).length,
        language: "en", // Could be detected
        confidence: 0.8,
      },
    };
  }

  /**
   * Parse Word documents
   */
  private async parseWordDocument(buffer: Buffer): Promise<ParsedContent> {
    // Simplified Word document parsing
    // In production, use a library like mammoth or docx
    const text = buffer.toString("utf-8");

    return {
      text,
      metadata: {
        wordCount: text.split(/\s+/).length,
        language: "en",
        confidence: 0.7,
      },
    };
  }

  /**
   * Parse images using OpenAI Vision
   */
  private async parseImage(buffer: Buffer): Promise<ParsedContent> {
    try {
      // Convert buffer to base64
      const base64Image = buffer.toString("base64");

      // Use OpenAI Vision API to extract text from image
      const response = await generateText({
        model: openai("gpt-4o"),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all text from this image. If it contains construction plans, estimates, or project details, format it clearly with sections and measurements.",
              },
              {
                type: "image",
                image: `data:image/jpeg;base64,${base64Image}`,
              },
            ],
          },
        ],
        maxOutputTokens: 2000,
      });

      const text = response.text || "";

      return {
        text,
        metadata: {
          wordCount: text.split(/\s+/).length,
          language: "en",
          confidence: 0.9,
        },
      };
    } catch (error) {
      logger.error("Error parsing image:", error);
      throw new Error("Failed to parse image content");
    }
  }

  /**
   * Parse audio files using Whisper
   */
  private async parseAudio(buffer: Buffer): Promise<ParsedContent> {
    try {
      // Use OpenAI Whisper API for transcription
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(buffer)], { type: "audio/wav" });
      formData.append("file", blob, "audio.wav");
      formData.append("model", EA_TRANSCRIPTION_MODEL);
      formData.append("response_format", "json");

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
        throw new Error(`Whisper API error: ${response.status}`);
      }

      const result = await response.json();
      const text = result.text || "";

      return {
        text,
        metadata: {
          wordCount: text.split(/\s+/).length,
          language: result.language || "en",
          confidence: 0.95,
        },
      };
    } catch (error) {
      logger.error("Error transcribing audio:", error);
      throw new Error("Failed to transcribe audio content");
    }
  }

  /**
   * Parse transcript text
   */
  private async parseTranscript(
    request: IngestionRequest,
  ): Promise<ParsedContent> {
    if (!request.content) {
      throw new Error("Content required for transcript parsing");
    }

    // Clean and structure transcript text
    const text = request.content
      .replace(/\n\s*\n/g, "\n") // Remove excessive whitespace
      .trim();

    return {
      text,
      metadata: {
        wordCount: text.split(/\s+/).length,
        language: "en",
        confidence: 0.9,
      },
    };
  }

  /**
   * Parse plain text
   */
  private async parseText(request: IngestionRequest): Promise<ParsedContent> {
    if (!request.content) {
      throw new Error("Content required for text parsing");
    }

    const text = request.content.trim();

    // Try to identify sections in the text
    const sections = this.identifySections(text);

    return {
      text,
      metadata: {
        wordCount: text.split(/\s+/).length,
        language: "en",
        confidence: 1.0,
        sections,
      },
    };
  }

  /**
   * Identify sections in text (for construction documents)
   */
  private identifySections(text: string): Array<{
    title: string;
    content: string;
    startIndex: number;
    endIndex: number;
  }> {
    const sections: Array<{
      title: string;
      content: string;
      startIndex: number;
      endIndex: number;
    }> = [];

    // Common construction document section patterns
    const sectionPatterns = [
      /^(\d+\.?\s*[A-Z][^.\n]*)/gm, // Numbered sections
      /^([A-Z][A-Z\s]+:)/gm, // ALL CAPS sections
      /^(Scope of Work|Materials|Labor|Equipment|Timeline|Cost Breakdown)/gim,
    ];

    for (const pattern of sectionPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const title = match[1].trim();
        const startIndex = match.index;

        // Find the end of this section (next section or end of text)
        const nextMatch = pattern.exec(text);
        const endIndex = nextMatch ? nextMatch.index : text.length;

        const content = text.slice(startIndex, endIndex).trim();

        sections.push({
          title,
          content,
          startIndex,
          endIndex,
        });
      }
    }

    return sections;
  }

  /**
   * Generate embedding for text content
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const { embedding } = await embed({
        model: openai.embedding(EA_EMBEDDING_MODEL),
        value: text,
      });

      return embedding;
    } catch (error) {
      logger.error("Error generating embedding:", error);
      throw new Error("Failed to generate embedding");
    }
  }

  /**
   * Batch process multiple items
   */
  async batchIngest(requests: IngestionRequest[]): Promise<IngestionResult[]> {
    const results: IngestionResult[] = [];

    // Process in parallel with concurrency limit
    const concurrency = 5;
    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((request) => this.ingest(request)),
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Get ingestion statistics
   */
  async getStats(clientId: string) {
    return vectorStore.getStats(clientId);
  }
}

// Export singleton instance
export const ingestionAgent = IngestionAgent.getInstance();

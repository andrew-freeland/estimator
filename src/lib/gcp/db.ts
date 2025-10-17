// @module: gcp_db
// Google Cloud SQL (Postgres) + pgvector adapter for Estimator Assistant MCP
// Extends existing database setup with vector search capabilities for RAG
//
// ⚠️  TEMPORARILY MODIFIED FOR DEPLOYMENT ⚠️
//
// This file has been modified to work without pgvector imports during build.
// See DEPLOYMENT_STATUS.md for details on restoring full functionality.
//
// TEMPORARILY DISABLED:
// - pgvector import (causing build issues)
// - Vector operations using vector() function
//
// TO RESTORE:
// 1. Set up CloudSQL database with pgvector extension
// 2. Uncomment the vector import below
// 3. Replace sql.raw() calls with vector() function calls

import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
// TODO: Re-enable after database setup
// import { vector } from "pgvector/pg";
import { sql } from "drizzle-orm";
import logger from "@/lib/logger";

// EA_ prefix for Estimator Assistant
// Runtime-safe database connection - lazy initialization
let dbInstance: ReturnType<typeof drizzle> | null = null;
let poolInstance: Pool | null = null;

async function getDatabaseConnection() {
  if (dbInstance && poolInstance) {
    return { db: dbInstance, pool: poolInstance };
  }

  const EA_DATABASE_URL = process.env.EA_DATABASE_URL || process.env.DATABASE_URL;
  
  if (!EA_DATABASE_URL) {
    throw new Error(
      "EA_DATABASE_URL or DATABASE_URL environment variable is required",
    );
  }

  // Initialize postgres connection with Cloud SQL optimizations
  const connectionString = EA_DATABASE_URL;

  // Configure postgres client for Cloud SQL
  poolInstance = new Pool({
    connectionString,
    // Cloud SQL connection optimizations
    max: 20, // Maximum number of connections
    idleTimeoutMillis: 20000, // Close idle connections after 20 seconds
    connectionTimeoutMillis: 10000, // Connection timeout
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });

  // Initialize drizzle with the postgres pool
  dbInstance = drizzle(poolInstance);
  
  return { db: dbInstance, pool: poolInstance };
}

// Lazy database getter
export async function getDb() {
  const { db } = await getDatabaseConnection();
  return db;
}

// For backward compatibility, export a getter that throws if accessed at module level
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop) {
    throw new Error(
      "Database connection accessed at module level. Use getDb() function instead for runtime-safe access."
    );
  }
});

// Vector search utilities for RAG embeddings
export class VectorStore {
  private static instance: VectorStore;

  private constructor() {
    // No database reference stored at construction time
  }

  public static getInstance(): VectorStore {
    if (!VectorStore.instance) {
      VectorStore.instance = new VectorStore();
    }
    return VectorStore.instance;
  }

  private async getDb() {
    return await getDb();
  }

  /**
   * Initialize pgvector extension and create embeddings table
   * This should be run once during database setup
   */
  async initializeVectorStore() {
    try {
      const db = await this.getDb();
      // Enable pgvector extension
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);

      // Create embeddings table for RAG
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS ea_embeddings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id TEXT NOT NULL,
          job_id TEXT,
          source_path TEXT NOT NULL,
          source_type TEXT NOT NULL, -- 'file', 'transcript', 'text'
          content TEXT NOT NULL,
          embedding vector(3072), -- text-embedding-3-large dimensions
          metadata JSONB DEFAULT '{}',
          revision INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create indexes for efficient vector search
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS ea_embeddings_client_job_idx 
        ON ea_embeddings(client_id, job_id);
      `);

      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS ea_embeddings_source_idx 
        ON ea_embeddings(source_path, source_type);
      `);

      // Vector similarity search index (HNSW for better performance)
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS ea_embeddings_vector_idx 
        ON ea_embeddings USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
      `);

      logger.info("Vector store initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize vector store:", error);
      throw error;
    }
  }

  /**
   * Store embedding with metadata for RAG retrieval
   */
  async storeEmbedding(params: {
    clientId: string;
    jobId?: string;
    sourcePath: string;
    sourceType: "file" | "transcript" | "text";
    content: string;
    embedding: number[];
    metadata?: Record<string, any>;
    revision?: number;
  }) {
    const {
      clientId,
      jobId,
      sourcePath,
      sourceType,
      content,
      embedding,
      metadata = {},
      revision = 1,
    } = params;

    try {
      const db = await this.getDb();
      await db.execute(sql`
        INSERT INTO ea_embeddings (
          client_id, job_id, source_path, source_type, 
          content, embedding, metadata, revision
        ) VALUES (
          ${clientId}, ${jobId}, ${sourcePath}, ${sourceType},
          ${content}, ${sql.raw(`'[${embedding.join(",")}]'::vector`)}, ${JSON.stringify(metadata)}, ${revision}
        )
        ON CONFLICT (client_id, source_path, source_type, revision) 
        DO UPDATE SET
          content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata,
          updated_at = CURRENT_TIMESTAMP;
      `);

      logger.info(`Stored embedding for ${sourcePath} (${sourceType})`);
    } catch (error) {
      logger.error("Failed to store embedding:", error);
      throw error;
    }
  }

  /**
   * Search for similar embeddings using cosine similarity
   */
  async searchSimilar(params: {
    clientId: string;
    jobId?: string;
    queryEmbedding: number[];
    limit?: number;
    threshold?: number;
  }) {
    const {
      clientId,
      jobId,
      queryEmbedding,
      limit = 10,
      threshold = 0.7,
    } = params;

    try {
      const db = await this.getDb();
      const results = await db.execute(sql`
        SELECT 
          id, client_id, job_id, source_path, source_type,
          content, metadata, revision, created_at,
          1 - (embedding <=> ${sql.raw(`'[${queryEmbedding.join(",")}]'::vector`)}) as similarity
        FROM ea_embeddings
        WHERE client_id = ${clientId}
          ${jobId ? sql`AND (job_id = ${jobId} OR job_id IS NULL)` : sql``}
          AND 1 - (embedding <=> ${sql.raw(`'[${queryEmbedding.join(",")}]'::vector`)}) > ${threshold}
        ORDER BY embedding <=> ${sql.raw(`'[${queryEmbedding.join(",")}]'::vector`)}
        LIMIT ${limit};
      `);

      return results.rows;
    } catch (error) {
      logger.error("Failed to search embeddings:", error);
      throw error;
    }
  }

  /**
   * Delete embeddings by source path or client
   */
  async deleteEmbeddings(params: {
    clientId: string;
    sourcePath?: string;
    jobId?: string;
  }) {
    const { clientId, sourcePath, jobId } = params;

    try {
      const db = await this.getDb();
      if (sourcePath) {
        await db.execute(sql`
          DELETE FROM ea_embeddings 
          WHERE client_id = ${clientId} AND source_path = ${sourcePath};
        `);
      } else if (jobId) {
        await db.execute(sql`
          DELETE FROM ea_embeddings 
          WHERE client_id = ${clientId} AND job_id = ${jobId};
        `);
      } else {
        await db.execute(sql`
          DELETE FROM ea_embeddings 
          WHERE client_id = ${clientId};
        `);
      }

      logger.info(`Deleted embeddings for client ${clientId}`);
    } catch (error) {
      logger.error("Failed to delete embeddings:", error);
      throw error;
    }
  }

  /**
   * Get embedding statistics for monitoring
   */
  async getStats(clientId: string) {
    try {
      const db = await this.getDb();
      const stats = await db.execute(sql`
        SELECT 
          COUNT(*) as total_embeddings,
          COUNT(DISTINCT source_path) as unique_sources,
          COUNT(DISTINCT job_id) as unique_jobs,
          AVG(array_length(embedding, 1)) as avg_embedding_dimensions
        FROM ea_embeddings
        WHERE client_id = ${clientId};
      `);

      return stats.rows[0];
    } catch (error) {
      logger.error("Failed to get embedding stats:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const vectorStore = VectorStore.getInstance();

// Database health check
export async function checkDatabaseHealth() {
  try {
    const db = await getDb();
    await db.execute(sql`SELECT 1`);
    logger.info("Database connection healthy");
    return true;
  } catch (error) {
    logger.error("Database health check failed:", error);
    return false;
  }
}

// Graceful shutdown
export async function closeDatabaseConnection() {
  try {
    const { pool } = await getDatabaseConnection();
    await pool.end();
    logger.info("Database connection closed");
  } catch (error) {
    logger.error("Error closing database connection:", error);
  }
}

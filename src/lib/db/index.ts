// Database exports and type definitions
import { drizzle } from "drizzle-orm/postgres-js";
import { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./pg/schema.pg";
import { pgDb } from "./pg/db.pg";

// Export the database client with proper typing
export const db = pgDb;

// Export schema for type inference
export { schema };

// Export individual table types for better type safety
export type Database = typeof schema;

// Export insert and select types for repositories
export type AgentInsert = typeof schema.AgentTable.$inferInsert;
export type AgentSelect = typeof schema.AgentTable.$inferSelect;
export type ArchiveInsert = typeof schema.ArchiveTable.$inferInsert;
export type ArchiveSelect = typeof schema.ArchiveTable.$inferSelect;
export type ChatThreadInsert = typeof schema.ChatThreadTable.$inferInsert;
export type ChatThreadSelect = typeof schema.ChatThreadTable.$inferSelect;
export type ChatMessageInsert = typeof schema.ChatMessageTable.$inferInsert;
export type ChatMessageSelect = typeof schema.ChatMessageTable.$inferSelect;
export type McpServerInsert = typeof schema.McpServerTable.$inferInsert;
export type McpServerSelect = typeof schema.McpServerTable.$inferSelect;
export type UserInsert = typeof schema.UserTable.$inferInsert;
export type UserSelect = typeof schema.UserTable.$inferSelect;
export type ContractorProfileInsert =
  typeof schema.ContractorProfileTable.$inferInsert;
export type ContractorProfileSelect =
  typeof schema.ContractorProfileTable.$inferSelect;
export type McpOAuthSessionInsert =
  typeof schema.McpOAuthSessionTable.$inferInsert;
export type McpOAuthSessionSelect =
  typeof schema.McpOAuthSessionTable.$inferSelect;
export type McpServerCustomizationInsert =
  typeof schema.McpServerCustomizationTable.$inferInsert;
export type McpServerCustomizationSelect =
  typeof schema.McpServerCustomizationTable.$inferSelect;
export type McpToolCustomizationInsert =
  typeof schema.McpToolCustomizationTable.$inferInsert;
export type McpToolCustomizationSelect =
  typeof schema.McpToolCustomizationTable.$inferSelect;
export type WorkflowInsert = typeof schema.WorkflowTable.$inferInsert;
export type WorkflowSelect = typeof schema.WorkflowTable.$inferSelect;
export type WorkflowNodeInsert =
  typeof schema.WorkflowNodeDataTable.$inferInsert;
export type WorkflowNodeSelect =
  typeof schema.WorkflowNodeDataTable.$inferSelect;

// Re-export commonly used types
export type {
  Agent,
  AgentRepository,
  AgentSummary,
} from "app-types/agent";

export type { MCPServerConfig } from "app-types/mcp";

export type { UserPreferences } from "app-types/user";

export type {
  DBWorkflow,
  DBEdge,
  DBNode,
} from "app-types/workflow";

// Export table types for repositories
export type AgentTable = typeof schema.AgentTable;
export type ChatThreadTable = typeof schema.ChatThreadTable;
export type ChatMessageTable = typeof schema.ChatMessageTable;
export type McpServerTable = typeof schema.McpServerTable;
export type UserTable = typeof schema.UserTable;
export type BookmarkTable = typeof schema.BookmarkTable;
export type ArchiveTable = typeof schema.ArchiveTable;
export type ArchiveItemTable = typeof schema.ArchiveItemTable;
export type ContractorProfileTable = typeof schema.ContractorProfileTable;
export type McpOAuthSessionTable = typeof schema.McpOAuthSessionTable;
export type McpServerCustomizationTable =
  typeof schema.McpServerCustomizationTable;
export type McpToolCustomizationTable = typeof schema.McpToolCustomizationTable;
export type WorkflowTable = typeof schema.WorkflowTable;
export type WorkflowNodeDataTable = typeof schema.WorkflowNodeDataTable;
export type WorkflowEdgeTable = typeof schema.WorkflowEdgeTable;

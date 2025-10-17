// @module: google_mcp
// Google Workspace MCP tool for Estimator Assistant
// Provides access to Google Drive files, Sheets data, and Workspace integration

import "server-only";
import { tool as createTool } from "ai";
import { z } from "zod";
import { google } from "googleapis";
import logger from "lib/logger";

// EA_ prefix for Estimator Assistant
const EA_GOOGLE_CLIENT_ID = process.env.EA_GOOGLE_CLIENT_ID;
const EA_GOOGLE_CLIENT_SECRET = process.env.EA_GOOGLE_CLIENT_SECRET;
// Stack compliance update: Remove unused variable
// const _EA_GOOGLE_API_KEY = process.env.EA_GOOGLE_API_KEY;

if (!EA_GOOGLE_CLIENT_ID || !EA_GOOGLE_CLIENT_SECRET) {
  logger.warn(
    "Google OAuth credentials not set - Google Workspace tools will be disabled",
  );
}

// Initialize Google APIs
const oauth2Client = new google.auth.OAuth2(
  EA_GOOGLE_CLIENT_ID,
  EA_GOOGLE_CLIENT_SECRET,
  `${process.env.BASE_URL}/api/mcp/google/oauth/callback`,
);

// Set up Google APIs
const drive = google.drive({ version: "v3", auth: oauth2Client });
const sheets = google.sheets({ version: "v4", auth: oauth2Client });
const docs = google.docs({ version: "v1", auth: oauth2Client });

// Types for Google API responses
interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime: string;
  modifiedTime: string;
  webViewLink?: string;
  webContentLink?: string;
}

interface GoogleSheetData {
  range: string;
  values: string[][];
}

interface GoogleDocContent {
  title: string;
  body: {
    content: Array<{
      paragraph?: {
        elements: Array<{
          textRun?: {
            content: string;
          };
        }>;
      };
    }>;
  };
}

// Research-backed fix: Google API error handling and rate limiting
async function handleGoogleAPIError(error: any, operation: string) {
  if (error.code === 403 || error.code === 429) {
    // Rate limit or quota exceeded
    logger.warn(
      `Google API rate limit/quota exceeded for ${operation}:`,
      error.message,
    );
    throw new Error(`Google API rate limit exceeded. Please try again later.`);
  } else if (error.code === 401) {
    // Authentication error
    logger.error(
      `Google API authentication failed for ${operation}:`,
      error.message,
    );
    throw new Error(
      `Google API authentication failed. Please re-authenticate.`,
    );
  } else {
    logger.error(`Google API error for ${operation}:`, error);
    throw new Error(`Google API error: ${error.message || "Unknown error"}`);
  }
}

// Helper function to set user credentials
function setUserCredentials(accessToken: string, refreshToken?: string) {
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
}

// Tool: Search Google Drive files
export const searchGoogleDriveTool = createTool({
  description: "Search for files in Google Drive by name, type, or content",
  inputSchema: z.object({
    query: z.string().describe("Search query for file names or content"),
    mimeType: z
      .string()
      .optional()
      .describe(
        "Filter by MIME type (e.g., 'application/vnd.google-apps.spreadsheet' for Sheets)",
      ),
    folderId: z
      .string()
      .optional()
      .describe("Search within a specific folder ID"),
    limit: z.number().default(20).describe("Maximum number of files to return"),
  }),
  execute: async (
    { query, mimeType, folderId, limit = 20 },
    _options?: any,
  ) => {
    try {
      logger.info(`Searching Google Drive for: ${query}`);

      let searchQuery = `name contains '${query}' or fullText contains '${query}'`;

      if (mimeType) {
        searchQuery += ` and mimeType='${mimeType}'`;
      }

      if (folderId) {
        searchQuery += ` and '${folderId}' in parents`;
      }

      const response = await drive.files
        .list({
          q: searchQuery,
          pageSize: limit,
          fields:
            "files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink)",
          orderBy: "modifiedTime desc",
        })
        .catch((error) => handleGoogleAPIError(error, "Drive files list"));

      const files = (response?.data?.files as GoogleDriveFile[]) || [];

      return {
        success: true,
        data: {
          files,
          count: files.length,
          query: searchQuery,
        },
      };
    } catch (error) {
      logger.error("Error searching Google Drive:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// Tool: Read Google Sheets data
export const readGoogleSheetTool = createTool({
  description: "Read data from a Google Sheets spreadsheet",
  inputSchema: z.object({
    spreadsheetId: z.string().describe("The Google Sheets spreadsheet ID"),
    range: z
      .string()
      .default("Sheet1")
      .describe("The range to read (e.g., 'Sheet1!A1:Z100' or 'Sheet1')"),
    includeHeaders: z
      .boolean()
      .default(true)
      .describe("Whether to treat the first row as headers"),
  }),
  execute: async (
    { spreadsheetId, range = "Sheet1", includeHeaders = true },
    _options?: any,
  ) => {
    try {
      logger.info(`Reading Google Sheet: ${spreadsheetId}, range: ${range}`);

      const response = await sheets.spreadsheets.values
        .get({
          spreadsheetId,
          range,
        })
        .catch((error) => handleGoogleAPIError(error, "Sheets values get"));

      const data = response?.data as GoogleSheetData;
      const values = data.values || [];

      const result: any = {
        rawData: values,
        count: values.length,
      };

      // Process headers if requested
      if (includeHeaders && values.length > 0) {
        const headers = values[0];
        const rows = values.slice(1).map((row) => {
          const obj: Record<string, string> = {};
          headers.forEach((header, index) => {
            obj[header] = row[index] || "";
          });
          return obj;
        });

        result.headers = headers;
        result.rows = rows;
        result.rowCount = rows.length;
      }

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      logger.error(`Error reading Google Sheet ${spreadsheetId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// Tool: Read Google Docs content
export const readGoogleDocTool = createTool({
  description: "Read content from a Google Docs document",
  inputSchema: z.object({
    documentId: z.string().describe("The Google Docs document ID"),
    extractText: z
      .boolean()
      .default(true)
      .describe("Whether to extract plain text content"),
  }),
  execute: async ({ documentId, extractText = true }, _options?: any) => {
    try {
      logger.info(`Reading Google Doc: ${documentId}`);

      const response = await docs.documents
        .get({
          documentId,
        })
        .catch((error) => handleGoogleAPIError(error, "Docs document get"));

      const doc = response?.data as GoogleDocContent;

      const result: any = {
        title: doc.title,
        documentId,
      };

      if (extractText) {
        // Extract plain text from document content
        const textContent: string[] = [];

        doc.body.content.forEach((element) => {
          if (element.paragraph) {
            element.paragraph.elements.forEach((elem) => {
              if (elem.textRun) {
                textContent.push(elem.textRun.content);
              }
            });
          }
        });

        result.textContent = textContent.join("");
        result.wordCount = result.textContent.split(/\s+/).length;
      }

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      logger.error(`Error reading Google Doc ${documentId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// Tool: Get file metadata
export const getGoogleFileMetadataTool = createTool({
  description: "Get metadata for a Google Drive file",
  inputSchema: z.object({
    fileId: z.string().describe("The Google Drive file ID"),
  }),
  execute: async ({ fileId }, _options?: any) => {
    try {
      logger.info(`Getting metadata for Google file: ${fileId}`);

      const response = await drive.files.get({
        fileId,
        fields:
          "id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, parents, owners, permissions",
      });

      const file = response.data as GoogleDriveFile & {
        parents?: string[];
        owners?: Array<{ displayName: string; emailAddress: string }>;
        permissions?: Array<{ role: string; type: string }>;
      };

      return {
        success: true,
        data: {
          file,
        },
      };
    } catch (error) {
      logger.error(`Error getting Google file metadata ${fileId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// Tool: Download file content
export const downloadGoogleFileTool = createTool({
  description: "Download content from a Google Drive file",
  inputSchema: z.object({
    fileId: z.string().describe("The Google Drive file ID"),
    exportFormat: z
      .string()
      .optional()
      .describe(
        "Export format for Google Workspace files (e.g., 'text/plain', 'application/pdf')",
      ),
  }),
  execute: async ({ fileId, exportFormat }, _options?: any) => {
    try {
      logger.info(`Downloading Google file: ${fileId}`);

      const response = await drive.files.get({
        fileId,
        alt: "media",
        ...(exportFormat && { mimeType: exportFormat }),
      });

      // Convert response to base64 for transmission
      const buffer = Buffer.from(response.data as ArrayBuffer);
      const base64Content = buffer.toString("base64");

      return {
        success: true,
        data: {
          fileId,
          content: base64Content,
          contentType: exportFormat || "application/octet-stream",
          size: buffer.length,
        },
      };
    } catch (error) {
      logger.error(`Error downloading Google file ${fileId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// Export all Google Workspace tools
export const googleWorkspaceTools = {
  searchDrive: searchGoogleDriveTool,
  readSheet: readGoogleSheetTool,
  readDoc: readGoogleDocTool,
  getFileMetadata: getGoogleFileMetadataTool,
  downloadFile: downloadGoogleFileTool,
};

// Export OAuth helper
export { oauth2Client, setUserCredentials };

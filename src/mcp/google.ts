// @module: google_mcp
// Google Workspace MCP tool for Estimator Assistant
// Provides access to Google Drive files, Sheets data, and Workspace integration

import "server-only";
import { Tool } from "ai";
import { google } from "googleapis";
import logger from "lib/logger";

// EA_ prefix for Estimator Assistant
const EA_GOOGLE_CLIENT_ID = process.env.EA_GOOGLE_CLIENT_ID;
const EA_GOOGLE_CLIENT_SECRET = process.env.EA_GOOGLE_CLIENT_SECRET;
const EA_GOOGLE_API_KEY = process.env.EA_GOOGLE_API_KEY;

if (!EA_GOOGLE_CLIENT_ID || !EA_GOOGLE_CLIENT_SECRET) {
  logger.warn("Google OAuth credentials not set - Google Workspace tools will be disabled");
}

// Initialize Google APIs
const oauth2Client = new google.auth.OAuth2(
  EA_GOOGLE_CLIENT_ID,
  EA_GOOGLE_CLIENT_SECRET,
  `${process.env.BASE_URL}/api/mcp/google/oauth/callback`
);

// Set up Google APIs
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const docs = google.docs({ version: 'v1', auth: oauth2Client });

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

// Helper function to set user credentials
function setUserCredentials(accessToken: string, refreshToken?: string) {
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
}

// Tool: Search Google Drive files
export const searchGoogleDriveTool: Tool = {
  description: "Search for files in Google Drive by name, type, or content",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query for file names or content",
      },
      mimeType: {
        type: "string",
        description: "Filter by MIME type (e.g., 'application/vnd.google-apps.spreadsheet' for Sheets)",
      },
      folderId: {
        type: "string",
        description: "Search within a specific folder ID",
      },
      limit: {
        type: "number",
        description: "Maximum number of files to return",
        default: 20,
      },
    },
    required: ["query"],
  },
  execute: async ({ query, mimeType, folderId, limit = 20 }) => {
    try {
      logger.info(`Searching Google Drive for: ${query}`);

      let searchQuery = `name contains '${query}' or fullText contains '${query}'`;
      
      if (mimeType) {
        searchQuery += ` and mimeType='${mimeType}'`;
      }
      
      if (folderId) {
        searchQuery += ` and '${folderId}' in parents`;
      }

      const response = await drive.files.list({
        q: searchQuery,
        pageSize: limit,
        fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink)',
        orderBy: 'modifiedTime desc',
      });

      const files = response.data.files as GoogleDriveFile[];

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
};

// Tool: Read Google Sheets data
export const readGoogleSheetTool: Tool = {
  description: "Read data from a Google Sheets spreadsheet",
  parameters: {
    type: "object",
    properties: {
      spreadsheetId: {
        type: "string",
        description: "The Google Sheets spreadsheet ID",
      },
      range: {
        type: "string",
        description: "The range to read (e.g., 'Sheet1!A1:Z100' or 'Sheet1')",
        default: "Sheet1",
      },
      includeHeaders: {
        type: "boolean",
        description: "Whether to treat the first row as headers",
        default: true,
      },
    },
    required: ["spreadsheetId"],
  },
  execute: async ({ spreadsheetId, range = "Sheet1", includeHeaders = true }) => {
    try {
      logger.info(`Reading Google Sheet: ${spreadsheetId}, range: ${range}`);

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const data = response.data as GoogleSheetData;
      const values = data.values || [];

      let result: any = {
        rawData: values,
        count: values.length,
      };

      // Process headers if requested
      if (includeHeaders && values.length > 0) {
        const headers = values[0];
        const rows = values.slice(1).map(row => {
          const obj: Record<string, string> = {};
          headers.forEach((header, index) => {
            obj[header] = row[index] || '';
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
};

// Tool: Read Google Docs content
export const readGoogleDocTool: Tool = {
  description: "Read content from a Google Docs document",
  parameters: {
    type: "object",
    properties: {
      documentId: {
        type: "string",
        description: "The Google Docs document ID",
      },
      extractText: {
        type: "boolean",
        description: "Whether to extract plain text content",
        default: true,
      },
    },
    required: ["documentId"],
  },
  execute: async ({ documentId, extractText = true }) => {
    try {
      logger.info(`Reading Google Doc: ${documentId}`);

      const response = await docs.documents.get({
        documentId,
      });

      const doc = response.data as GoogleDocContent;

      let result: any = {
        title: doc.title,
        documentId,
      };

      if (extractText) {
        // Extract plain text from document content
        const textContent: string[] = [];
        
        doc.body.content.forEach(element => {
          if (element.paragraph) {
            element.paragraph.elements.forEach(elem => {
              if (elem.textRun) {
                textContent.push(elem.textRun.content);
              }
            });
          }
        });

        result.textContent = textContent.join('');
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
};

// Tool: Get file metadata
export const getGoogleFileMetadataTool: Tool = {
  description: "Get metadata for a Google Drive file",
  parameters: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "The Google Drive file ID",
      },
    },
    required: ["fileId"],
  },
  execute: async ({ fileId }) => {
    try {
      logger.info(`Getting metadata for Google file: ${fileId}`);

      const response = await drive.files.get({
        fileId,
        fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, parents, owners, permissions',
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
};

// Tool: Download file content
export const downloadGoogleFileTool: Tool = {
  description: "Download content from a Google Drive file",
  parameters: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "The Google Drive file ID",
      },
      exportFormat: {
        type: "string",
        description: "Export format for Google Workspace files (e.g., 'text/plain', 'application/pdf')",
      },
    },
    required: ["fileId"],
  },
  execute: async ({ fileId, exportFormat }) => {
    try {
      logger.info(`Downloading Google file: ${fileId}`);

      const response = await drive.files.get({
        fileId,
        alt: 'media',
        ...(exportFormat && { mimeType: exportFormat }),
      });

      // Convert response to base64 for transmission
      const buffer = Buffer.from(response.data as ArrayBuffer);
      const base64Content = buffer.toString('base64');

      return {
        success: true,
        data: {
          fileId,
          content: base64Content,
          contentType: exportFormat || 'application/octet-stream',
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
};

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

// @module: security
// Multi-tenant security and session scoping for Estimator Assistant MCP
// Ensures data isolation between clients and organizations

import "server-only";
import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/auth-instance";
import { logSecurityEvent } from "@/lib/logs";
import logger from "@/lib/logger";

// EA_ prefix for Estimator Assistant
const EA_SECURITY_AUDIT_ENABLED =
  process.env.EA_SECURITY_AUDIT_ENABLED === "true";

// Security context interface
export interface SecurityContext {
  userId: string;
  clientId: string;
  organizationId: string;
  sessionId: string;
  permissions: string[];
  isAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

// Permission types
export type Permission =
  | "read:documents"
  | "write:documents"
  | "delete:documents"
  | "read:estimates"
  | "write:estimates"
  | "delete:estimates"
  | "read:jobs"
  | "write:jobs"
  | "delete:jobs"
  | "read:logs"
  | "admin:all";

// Security middleware for API routes
export async function withSecurity<T>(
  request: NextRequest,
  handler: (context: SecurityContext) => Promise<T>,
  requiredPermissions: Permission[] = [],
): Promise<T> {
  const startTime = Date.now();
  let securityContext: SecurityContext | null = null;

  try {
    // Get session
    const session = await getSession();
    if (!session?.user?.id) {
      await logSecurityEvent({
        event: "unauthorized_access_attempt",
        severity: "warn",
        details: {
          path: request.url,
          method: request.method,
          ipAddress: getClientIP(request),
          userAgent: request.headers.get("user-agent"),
        },
      });
      throw new Error("Unauthorized");
    }

    // Extract client ID from request
    const clientId = extractClientId(request);
    if (!clientId) {
      await logSecurityEvent({
        event: "missing_client_id",
        severity: "warn",
        userId: session.user.id,
        details: {
          path: request.url,
          method: request.method,
        },
      });
      throw new Error("Client ID required");
    }

    // Create security context
    securityContext = {
      userId: session.user.id,
      clientId,
      organizationId: extractOrganizationId(session.user.id, clientId),
      sessionId: generateSessionId(),
      permissions: getUserPermissions(session.user.id, clientId),
      isAdmin: isUserAdmin(session.user.id),
      ipAddress: getClientIP(request),
      userAgent: request.headers.get("user-agent") || undefined,
    };

    // Check permissions
    if (requiredPermissions.length > 0) {
      const hasPermission = requiredPermissions.every(
        (permission) =>
          securityContext.permissions.includes(permission) ||
          securityContext.permissions.includes("admin:all"),
      );

      if (!hasPermission) {
        await logSecurityEvent({
          event: "insufficient_permissions",
          severity: "warn",
          userId: session.user.id,
          clientId,
          details: {
            path: request.url,
            method: request.method,
            requiredPermissions,
            userPermissions: securityContext.permissions,
          },
        });
        throw new Error("Insufficient permissions");
      }
    }

    // Log successful access
    if (EA_SECURITY_AUDIT_ENABLED) {
      await logSecurityEvent({
        event: "api_access",
        severity: "info",
        userId: session.user.id,
        clientId,
        sessionId: securityContext.sessionId,
        details: {
          path: request.url,
          method: request.method,
          permissions: requiredPermissions,
          duration: Date.now() - startTime,
        },
      });
    }

    // Execute handler with security context
    return await handler(securityContext);
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log security error
    await logSecurityEvent({
      event: "security_error",
      severity: "error",
      userId: securityContext?.userId,
      clientId: securityContext?.clientId,
      sessionId: securityContext?.sessionId,
      details: {
        path: request.url,
        method: request.method,
        error: error instanceof Error ? error.message : "Unknown error",
        duration,
      },
    });

    throw error;
  }
}

// Extract client ID from request
function extractClientId(request: NextRequest): string | null {
  // Try to get from query parameters
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId");
  if (clientId) return clientId;

  // Try to get from headers
  const headerClientId = request.headers.get("x-client-id");
  if (headerClientId) return headerClientId;

  // Try to get from request body (for POST requests)
  // Note: This would require reading the body, which might not be ideal for all cases
  return null;
}

// Extract organization ID from user and client
function extractOrganizationId(_userId: string, clientId: string): string {
  // In a real implementation, this would query the database
  // to get the organization ID based on the user and client relationship
  // For now, we'll use a simple mapping
  return `org_${clientId}`;
}

// Get user permissions for a specific client
function getUserPermissions(_userId: string, _clientId: string): Permission[] {
  // In a real implementation, this would query the database
  // to get the user's permissions for the specific client/organization
  // For now, return basic permissions
  return [
    "read:documents",
    "write:documents",
    "read:estimates",
    "write:estimates",
    "read:jobs",
    "write:jobs",
  ];
}

// Check if user is admin
function isUserAdmin(_userId: string): boolean {
  // In a real implementation, this would query the database
  // to check if the user has admin privileges
  return false;
}

// Generate session ID
function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get client IP address
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIP = request.headers.get("x-real-ip");

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  if (realIP) {
    return realIP;
  }

  return "unknown";
}

// Data access control utilities
export class DataAccessControl {
  /**
   * Ensure user can only access data for their client
   */
  static async validateClientAccess(
    context: SecurityContext,
    targetClientId: string,
  ): Promise<void> {
    if (context.clientId !== targetClientId && !context.isAdmin) {
      await logSecurityEvent({
        event: "cross_client_access_attempt",
        severity: "error",
        userId: context.userId,
        clientId: context.clientId,
        sessionId: context.sessionId,
        details: {
          targetClientId,
          attemptedAccess: true,
        },
      });
      throw new Error("Access denied: Cross-client data access not allowed");
    }
  }

  /**
   * Ensure user can only access data for their organization
   */
  static async validateOrganizationAccess(
    context: SecurityContext,
    targetOrganizationId: string,
  ): Promise<void> {
    if (context.organizationId !== targetOrganizationId && !context.isAdmin) {
      await logSecurityEvent({
        event: "cross_organization_access_attempt",
        severity: "error",
        userId: context.userId,
        clientId: context.clientId,
        sessionId: context.sessionId,
        details: {
          targetOrganizationId,
          attemptedAccess: true,
        },
      });
      throw new Error(
        "Access denied: Cross-organization data access not allowed",
      );
    }
  }

  /**
   * Ensure user has required permission
   */
  static async validatePermission(
    context: SecurityContext,
    permission: Permission,
  ): Promise<void> {
    if (
      !context.permissions.includes(permission) &&
      !context.permissions.includes("admin:all")
    ) {
      await logSecurityEvent({
        event: "permission_denied",
        severity: "warn",
        userId: context.userId,
        clientId: context.clientId,
        sessionId: context.sessionId,
        details: {
          requiredPermission: permission,
          userPermissions: context.permissions,
        },
      });
      throw new Error(`Access denied: Permission '${permission}' required`);
    }
  }

  /**
   * Sanitize data for cross-tenant safety
   */
  static sanitizeData<T extends Record<string, any>>(
    data: T,
    _context: SecurityContext,
  ): T {
    // Remove any fields that might contain cross-tenant data
    const sanitized = { ...data };

    // Remove sensitive fields that shouldn't be exposed
    delete sanitized.clientId;
    delete sanitized.organizationId;
    delete sanitized.userId;

    return sanitized;
  }
}

// Rate limiting utilities
export class RateLimiter {
  private static limits = new Map<
    string,
    { count: number; resetTime: number }
  >();

  /**
   * Check if user has exceeded rate limit
   */
  static async checkRateLimit(
    context: SecurityContext,
    action: string,
    limit: number = 100,
    windowMs: number = 60000, // 1 minute
  ): Promise<boolean> {
    const key = `${context.userId}:${context.clientId}:${action}`;
    const now = Date.now();

    const current = this.limits.get(key);

    if (!current || now > current.resetTime) {
      // Reset or initialize
      this.limits.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (current.count >= limit) {
      await logSecurityEvent({
        event: "rate_limit_exceeded",
        severity: "warn",
        userId: context.userId,
        clientId: context.clientId,
        sessionId: context.sessionId,
        details: {
          action,
          limit,
          windowMs,
          currentCount: current.count,
        },
      });
      return false;
    }

    current.count++;
    return true;
  }

  /**
   * Clear rate limit for a user (admin function)
   */
  static clearRateLimit(
    userId: string,
    clientId: string,
    action?: string,
  ): void {
    if (action) {
      const key = `${userId}:${clientId}:${action}`;
      this.limits.delete(key);
    } else {
      // Clear all limits for user/client
      for (const key of this.limits.keys()) {
        if (key.startsWith(`${userId}:${clientId}:`)) {
          this.limits.delete(key);
        }
      }
    }
  }
}

// Input validation utilities
export class InputValidator {
  /**
   * Validate client ID format
   */
  static validateClientId(clientId: string): boolean {
    // Client ID should be alphanumeric with underscores, 3-50 characters
    return /^[a-zA-Z0-9_]{3,50}$/.test(clientId);
  }

  /**
   * Validate project ID format
   */
  static validateProjectId(projectId: string): boolean {
    // Project ID should be alphanumeric with underscores and hyphens, 3-100 characters
    return /^[a-zA-Z0-9_-]{3,100}$/.test(projectId);
  }

  /**
   * Validate job ID format
   */
  static validateJobId(jobId: string): boolean {
    // Job ID should be alphanumeric with underscores and hyphens, 3-100 characters
    return /^[a-zA-Z0-9_-]{3,100}$/.test(jobId);
  }

  /**
   * Sanitize string input
   */
  static sanitizeString(input: string, maxLength: number = 1000): string {
    return input.trim().substring(0, maxLength).replace(/[<>]/g, ""); // Remove potential HTML tags
  }

  /**
   * Validate file upload
   */
  static validateFileUpload(
    filename: string,
    size: number,
    mimeType: string,
    maxSize: number = 100 * 1024 * 1024, // 100MB
    allowedTypes: string[] = [
      "text/plain",
      "application/pdf",
      "image/jpeg",
      "image/png",
    ],
  ): { valid: boolean; error?: string } {
    if (size > maxSize) {
      return {
        valid: false,
        error: `File too large. Maximum size is ${maxSize / 1024 / 1024}MB`,
      };
    }

    if (!allowedTypes.includes(mimeType)) {
      return {
        valid: false,
        error: `File type not allowed. Allowed types: ${allowedTypes.join(", ")}`,
      };
    }

    if (!filename || filename.length > 255) {
      return { valid: false, error: "Invalid filename" };
    }

    return { valid: true };
  }
}

// All exports are already defined above (interfaces, types, classes, and functions)

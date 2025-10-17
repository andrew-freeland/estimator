import { z } from "zod";

export const passwordRegexPattern =
  process.env.NEXT_PUBLIC_PASSWORD_REGEX_PATTERN || "^.{6,50}$";

export const passwordRequirementsText =
  process.env.NEXT_PUBLIC_PASSWORD_REQUIREMENTS_TEXT ||
  "Password must be 6-50 characters long.";

// Shared password validation schema
export const passwordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters long.")
  .max(50, "Password cannot exceed 50 characters.")
  .regex(new RegExp(passwordRegexPattern), passwordRequirementsText);

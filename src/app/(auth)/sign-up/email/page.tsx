import EmailSignUp from "@/components/auth/email-sign-up";
import { getIsFirstUser } from "lib/auth/server";

// Force dynamic rendering to avoid build-time database calls
export const dynamic = "force-dynamic";
// Use Node.js runtime for database access
export const runtime = "nodejs";

export default async function EmailSignUpPage() {
  // Temporarily disable first user check to avoid better-auth ES module issues
  const isFirstUser = false;
  return <EmailSignUp isFirstUser={isFirstUser} />;
}

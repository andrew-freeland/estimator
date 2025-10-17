import SignIn from "@/components/auth/sign-in";
import { getAuthConfig } from "lib/auth/config";

// Force dynamic rendering to avoid build-time database calls
export const dynamic = "force-dynamic";
// Use Node.js runtime for database access
export const runtime = "nodejs";

export default async function SignInPage() {
  // Temporarily disable first user check to avoid better-auth ES module issues
  const isFirstUser = false;

  const {
    emailAndPasswordEnabled,
    signUpEnabled,
    socialAuthenticationProviders,
  } = getAuthConfig();
  const enabledProviders = (
    Object.keys(
      socialAuthenticationProviders,
    ) as (keyof typeof socialAuthenticationProviders)[]
  ).filter((key) => socialAuthenticationProviders[key]);
  return (
    <SignIn
      emailAndPasswordEnabled={emailAndPasswordEnabled}
      signUpEnabled={signUpEnabled}
      socialAuthenticationProviders={enabledProviders}
      isFirstUser={isFirstUser}
    />
  );
}

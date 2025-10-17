import { auth } from "auth/server";
import { toNextJsHandler } from "better-auth/next-js";

// Fixed Vercel Edge runtime (Better-Auth)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = toNextJsHandler(auth.handler);

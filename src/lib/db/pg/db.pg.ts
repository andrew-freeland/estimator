// import { Logger } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";

// class MyLogger implements Logger {
//   logQuery(query: string, params: unknown[]): void {
//     console.log({ query, params });
//   }
// }

// Build-safe database connection with fallback
const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const isGuestMode = process.env.AUTH_DISABLED === "true";

let pgDbInstance: ReturnType<typeof drizzlePg> | null = null;

if (!dbUrl) {
  if (process.env.NODE_ENV === "production" || isGuestMode) {
    console.warn(
      "⚠️ No POSTGRES_URL or DATABASE_URL set during build — skipping DB init",
    );
    pgDbInstance = null;
  } else {
    throw new Error(
      "Database URL not set. Please configure POSTGRES_URL or DATABASE_URL environment variable.",
    );
  }
} else {
  // Validate database URL format and user
  try {
    const url = new URL(dbUrl);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
      throw new Error(`Invalid database protocol: ${url.protocol}`);
    }

    // Warn about common user issues
    if (url.username === "root" && process.env.NODE_ENV !== "production") {
      console.warn(
        "⚠️ Using 'root' as database user. Consider using 'postgres' for better compatibility.",
      );
    }

    pgDbInstance = drizzlePg(dbUrl, {
      //   logger: new MyLogger(),
    });
  } catch (error) {
    console.error("Invalid database URL:", error);
    if (process.env.NODE_ENV === "production" || isGuestMode) {
      console.warn("⚠️ Invalid database URL during build — skipping DB init");
      pgDbInstance = null;
    } else {
      throw error;
    }
  }
}

export const pgDb = pgDbInstance;

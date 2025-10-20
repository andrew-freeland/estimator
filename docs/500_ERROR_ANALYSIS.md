# Builder's Business Partner – Updated Tech Stack Documentation & 500 Error Analysis

## Next.js 15.3.2 – Middleware and Guest Mode Considerations

Next.js 15 introduced significant changes to middleware. Notably, as of v15.2+, Next.js supports running middleware in a Node.js runtime (as opposed to the default Edge runtime). This means you can access Node modules (like fs, crypto, database clients, etc.) within middleware by adding a config flag:

```typescript
// middleware.ts
export const config = { runtime: 'nodejs' }; // Use full Node.js runtime
```

**Important**: In Next 15.3, Node.js middleware was still experimental – you had to use a canary release or enable an experimental flag for it to work. (It became fully stable in Next 15.5.) If you attempt to call Node-only APIs in middleware without the Node runtime, you may hit errors. For example, Better-Auth's session calls in middleware triggered an error: "The edge runtime does not support Node.js 'perf_hooks' module". This is because by default, global middleware runs on the Edge runtime which lacks Node modules.

### Guest Mode & Middleware
In "guest mode" (AUTH_DISABLED=true), your middleware is bypassing auth checks entirely (simply calling NextResponse.next() early). This should avoid invoking any Node-specific code on Edge. Ensure this short-circuit remains at the top.

If you later protect routes in middleware when auth is enabled, follow Best Practices from Better Auth:

**Cookie Existence Check**: Better Auth docs recommend just checking for a session cookie in middleware, rather than fully validating it there. For example, using getSessionCookie(request) to see if a session token cookie is present, and only performing a redirect if not. This avoids heavy API/DB calls in middleware and prevents Edge runtime issues (though remember a cookie existence check alone isn't a secure auth validation).

**Full Session Validation**: If you need to validate user roles or session data in middleware, use the Node runtime. With Next 15.3, that means enabling the experimental Node middleware feature. By Next 15.5, you can simply add the runtime: 'nodejs' config (no canary needed) to safely call auth.api.getSession() or access databases in middleware.

In summary, Next.js App Router doesn't inherently know about your "guest mode" – it's a custom toggle. Your approach of skipping auth when AUTH_DISABLED is true is valid. Just ensure that any code outside the middleware (e.g. in server components) also respects this mode to avoid unexpected DB or auth calls.

## Better-Auth Integration – Sessions & Guest Mode

Better Auth is a modern auth library designed for Next.js. In this app, it's integrated via the route handler in api/auth/[...all]/route.ts using toNextJsHandler(auth.handler). This sets up all Better Auth endpoints (login, signup, etc.) under /api/auth/*.

### Key points and updates from documentation:

**Session Management**: Better Auth uses secure, cookie-based sessions by default. You'll see cookies like better-auth.session_token and better-auth.session_data in the browser. The library expects a secret key for signing/encryption; make sure BETTER_AUTH_SECRET is set in your env (or it falls back to a default in development, but will error in production if not provided).

**Database Configuration**: Better Auth can work with various databases (Postgres, MySQL, SQLite, etc.) as a user/session store. In your auth.ts you likely specified database: { dialect: 'postgres', ... }. Ensure the database is reachable when auth is active. If the database URL is missing, Better Auth could fail during user or session operations. (There isn't a built-in "disable DB" mode in Better Auth – it assumes a working DB for persistent auth.)

**Guest Mode Impact**: Because you've set AUTH_DISABLED=true, effectively no user needs to log in. You might not even call any Better Auth functions in this mode. It's worth noting that Better Auth itself doesn't have an official "guest mode" toggle – this is an app-level concept. Here are recommendations:

- **Avoid Unneeded Auth Calls**: When AUTH_DISABLED is true, skip calling auth methods entirely. For example, the SimplifiedChatBot component for guests should not call auth.api.getSession() or any sign-in logic.
- **Temporary Guest Identity**: If your app still creates a temporary user ID (like using crypto.randomUUID() for guests), that's fine – just ensure it's only stored in memory or state (e.g., Zustand store) and not passed to Better Auth, since those users don't exist in the auth database.
- **Upgrading Guests**: Some applications allow anonymous sessions that can later be converted to real accounts. Better Auth doesn't do this automatically, but you can implement it. For instance, a DEV guide suggests creating an anonymous user flow and then linking to a permanent account upon sign-up. This involves database entries for guest users. However, since your guest mode uses no DB, you're essentially running the chatbot entirely client-side or in memory for guests.

**Route Protection**: When auth is enabled, you'll use middleware or server checks to protect pages. Better Auth's docs for Next.js emphasize not doing heavy auth checks in RSCs or middleware due to performance. Instead, one pattern is:

1. Check for the session cookie in middleware (fast) – if missing, redirect to /sign-in.
2. In page Server Components or Server Actions, use auth.api.getSession({ headers }) for a true session object if needed (since you can safely call it on the server where Node environment is available).

In your case, with Node middleware available (if enabled), you could also fully validate the session in middleware. Just be cautious of the Edge vs Node runtime as discussed. The error we saw (perf_hooks not supported) was due to calling auth.api.getSession() in Edge middleware. The solution was to either switch to Node runtime (Next 15.2+ supports this) or avoid that call in middleware and do a simple cookie check instead.

**Bottom line**: Better Auth should work with Next 15, but you must adjust for the runtime. Since you're running in guest mode, ensure Better Auth's routes and DB calls are effectively no-ops unless auth is enabled. Double-check that no part of your app is unintentionally calling a Better Auth function (or accessing the user DB) on initial page load in guest mode – that could be a source of the 500 error if it's not guarded.

## Drizzle ORM (PostgreSQL) – Handling No-DB Scenarios

Your app uses Drizzle ORM with Node-Postgres for database access. Drizzle is type-safe and lightweight, but it typically expects a database connection string at runtime. In your code, you've implemented logic to skip initializing the DB in guest mode (when no POSTGRES_URL/DATABASE_URL is provided). Specifically, if AUTH_DISABLED=true, you set pgDbInstance = null instead of calling drizzle() on a Postgres client.

### Why this matters:
Any attempt to use the db object when it's null will throw an error and could be causing the 500. This pattern (setting DB to null and guarding each usage) is known and has been discussed by others using Drizzle. For example, one developer described setting the DB to null and then wrapping every DB call with a check:

```typescript
async function findAllUsers(): Promise<User[]> {
    if (db === null) return [];       // return empty if no DB
    return db.select().from(usersTable);
}
```

This approach works but is tedious – you must ensure every place that uses the DB handles the null case. If you missed a spot (for instance, if the Chat page tries to load threads with db without a guard), it would throw at runtime.

### Key strategies to avoid errors:

**Verify Guards**: Audit all functions that access the database (fetching threads, messages, etc.). In guest mode, these should either (a) not be called at all, or (b) internally check if (!db) return ... safe defaults instead of using the DB. The GitHub discussion on building without a DB emphasizes this approach and notes it's functional but not ideal.

**Use an In-Memory DB (Alternative)**: Drizzle supports SQLite which can run in-memory. For example, using the drizzle-orm/bun-sqlite driver, calling drizzle() with no file path creates an in-memory SQLite DB. In guest mode, you could initialize Drizzle with an in-memory DB. This way, your code can still call db (it won't persist anything, but it also won't crash). This might be overkill, but it's an option:

```typescript
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
const db = drizzleSqlite(); // creates an in-memory SQLite DB
```

You'd only do this in guest mode, and continue using the Postgres db in normal mode. This avoids sprinkling if (db===null) everywhere, at the cost of having two DB connections in code. Many projects simply stick with the null approach and guards.

**Build Time vs Runtime**: Another point from the community – Drizzle sometimes tries to connect or verify the database at build time, which can be problematic if no DB is available. Ensure your skip DB init logic runs in production and dev, so that building the app (or running it in development) doesn't attempt a connection. Your code snippet suggests in production or guest mode you skip DB init, which is good. Just remember to handle the development case too (e.g., if not guest and no DB URL in dev, you purposely throw an error to remind yourself to set up the DB).

**Summary**: The 500 error could very likely be coming from an unguarded DB call. Double-check components like the main Chat interface: if it tries to load saved threads or persist a message when db = null, that would throw. You might implement a no-op or stub for those actions in guest mode (e.g., return an empty list of threads, or log messages to console instead of DB). The Drizzle docs themselves don't offer a built-in "optional connection" mode, so it's on the developer to handle it gracefully.

## Framer Motion – Next.js 15 Compatibility

Your UI uses Framer Motion for animations (e.g., the BBP logo greeting). Framer Motion works great with Next.js, but you must be mindful of client vs server component usage:

### Use Client Components for Animation
The error "TypeError: createContext only works in Client Components. Add the 'use client' directive…" is a common issue when using Framer Motion in Next's App Router. The fix is to ensure any component implementing motion or other Framer Motion hooks is a Client Component. Add "use client" at the top of the file before imports. This tells Next.js to run that component purely on the client. In practice, your main layout can still be a server component, but the portion with <motion.div> should be isolated in a client component file. Even with Next 15's improvements, this rule stands: third-party animation libraries manipulate DOM/React state on the client, so they cannot run during server-side rendering.

### Shared Layout Animations
If you use advanced Framer Motion features like layout animations or AnimatePresence, be aware of some quirks. There have been reported bugs with shared layout animations (using layoutId) not working properly under the App Router. This wouldn't typically throw a 500 error; it just means some animations won't play. Framer Motion v5 removed the need for an <AnimateSharedLayout> wrapper, but Next.js 13/15 had issues animating between routes. If you encounter missing animations, it's a known limitation in Next's architecture (tracked in Next.js issue #49279).

### Version Compatibility (React 19)
Next.js 15 uses React 18 by default, and experimental React 19 support. Check which React version your app is running. Framer Motion's older versions (v10 and below) had incompatibilities with React 19. In fact, as of mid-2024 it was noted "Framer Motion is incompatible with React 19" and needed updates to support the new concurrent features. If you've upgraded to React 19 (perhaps Next 15.3 with React 19 RC), consider updating Framer Motion:

Framer Motion v11 (2025) was released with explicit React 19 support and improvements. It introduced more reliable layout animations under React 19's concurrent rendering, plus performance enhancements. Upgrading to v11 (or whatever the latest version is now, possibly rebranded to the new "Motion" library) is recommended for Next 15+ projects. This ensures you're not hitting any subtle bugs from older versions that weren't built for React 19.

The latest Framer Motion (Motion) versions list React 18 and 19 in peer dependencies. Check your package.json – if you see a peer dependency warning about React 19, that's a sign you need a newer release of Framer Motion (or to force install it). The Framer/Motion devs tracked these updates in their repo.

**Action items**: Double-check that your animation components have "use client" at top (this is the likely cause of any immediate 500 on rendering an animation component). Then verify your Framer Motion package version. If it's outdated relative to React 19, upgrade to the latest v11+ which explicitly supports React 19 concurrent features. This will future-proof your animations and possibly fix any runtime errors related to React updates.

## Shadcn/UI – Component Library Updates and Compatibility

Shadcn/UI (the component library used alongside Tailwind CSS) has evolved rapidly, especially to support new Next/React versions:

### React 19 & Tailwind CSS v4 Support
The Shadcn team updated the library to fully support React 19 and Tailwind 4 in the latest release (currently available on the canary version of the CLI). Earlier versions of shadcn/ui had peer dependency conflicts when used with Next 15/React 19, because many underlying packages still expected React 18. This led to installation issues where the shadcn CLI or dependencies would error or refuse to install. Now, as per shadcn's docs, the solution is integrated: you can run the shadcn UI installer with special flags if using npm to bypass peer dep checks:

The CLI will prompt: "It looks like you are using React 19… How would you like to proceed?" and offer --force or --legacy-peer-deps options. Using one of these allows you to install all components despite peer warnings. (If you use pnpm or Yarn, this is less of an issue, as they handle peer deps more leniently.)

### Tailwind v4 Compatibility
If your project uses Tailwind CSS v4 (which introduced new features in late 2024), note that older versions of the shadcn/ui CLI didn't initially support Tailwind 4. There was a known bug where trying to install shadcn in a Next 15 + Tailwind v4 project failed. The interim workaround was to downgrade to Tailwind v3 or manually adjust the installation. However, the shadcn team addressed this by updating the CLI and templates for Tailwind v4. As of the latest canary, Tailwind v4 should work out-of-the-box. So if you experienced issues like "cannot install shadcn for Next15 with Tailwind v4", be sure to update to the newest shadcn CLI.

### Component Updates
Shadcn's components (built on Radix UI, etc.) are mostly static copies. After installation, they don't auto-update with the CLI. If Next or React updates caused any breakages (for example, maybe a change in React's event system or a Tailwind utility change), you'd need to pull in updated component code. Check the shadcn documentation for any breaking changes notes or run the shadcn CLI's upgrade steps. They provided an "Upgrade Status" table for each dependency showing if it's React 19 compatible – most are green checkmarks now, with a few that needed flags as of React 19 RC.

### Peer Dep Dependencies
The reddit discussion you referenced ("nextjs v15 with shadcn is completely broken") was primarily about peer deps issues when Next 15 (with React 19) was first released. Those issues are resolved by updating dependencies to versions that include React 19 in their peer range. For instance, updating lucide-react, react-hook-form, etc., to versions that list React 19. The Shadcn docs link to a progress tracker for these packages. Ensure your project's dependencies match the recommended versions:

Radix UI libraries and others should be at least the versions that the shadcn guide marks as compatible. If you used the shadcn installer recently, it should have pulled those in (or used --force to ignore the warnings if they weren't officially updated yet).

### In practice, to fix any Shadcn issues:

1. **Update Shadcn CLI and Re-run Init**: Install the latest npx shadcn@latest and run the init or generator in a new temp project with React 19 flags to see if any config changes are needed (compare with your project).
2. **Manual Fixes**: If some components broke due to React 19, you might need to adjust imports. For example, ensure any usage of useEffect or other hooks in those components is correct. (No specific breaking changes are documented aside from peer deps; Shadcn components are mostly simple and should continue to work once installed.)

Given that your 500 error occurs on page load, it's less likely to be a Shadcn UI component causing it (those usually would throw a React render error, not a server 500, unless a dynamic import failed). However, if the error happened during build or hydration, a mismatched component could be an issue. Use the browser dev console and terminal output to see if any component import failed. For example, a missing peer dependency or a Tailwind plugin error would show up in the logs.

**Summary**: Use the updated documentation and CLI for Shadcn/UI to ensure all components are compatible with Next 15. The library is now compatible with React 19 and Tailwind 4 per the official docs. Any installation hiccups can be solved with --legacy-peer-deps or similar flags as documented. Once that's sorted, your UI library should not be the source of runtime errors.

## 🔎 Likely Cause of the 500 Error

Bringing it all together, the most probable causes for the 500 Internal Server Error on your / page (in guest mode) are:

1. **Unprotected DB call in guest mode**: The chat page or a layout is trying to load data from the database even though db is null (due to your guest logic). This would throw an exception server-side. Double-check any fetcher or SWR data load that runs on page load.

2. **Improper Client/Server component usage**: Possibly the animated greeting (Framer Motion) or some Shadcn UI component was not marked as client but uses client-side APIs. The typical culprit is the Framer Motion usage – ensure the component with <motion.div> has "use client" at top. A mismatch here can cause a server rendering error (500).

3. **Better Auth side-effects**: Even in guest mode, if your app is still wrapping pages in auth context or calling auth.getSession() somewhere on render, it could be failing because there's no session and perhaps no DB. For instance, if your App Header tries to show the user's name by calling a server action auth.api.getSession(), that might error out (since DB is off or because it's running in an Edge context). In guest mode, you'd want to skip or dummy out such calls.

Using the information above, systematically eliminate each potential issue:

- Wrap any DB calls with conditionals for guest mode (return empty data or defaults).
- Add "use client" to any component using browser-only libraries (animations, state, etc.).
- Ensure Better Auth is effectively dormant when AUTH_DISABLED – no session checks that hit the DB or crypto libs.

By updating your code according to the latest documentation and fixes (as detailed), you should resolve the internal server error and have a more stable setup aligned with current best practices. Good luck, and happy building!

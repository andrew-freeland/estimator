# Deployment Guidelines

This document provides comprehensive guidelines for deploying the Better Chatbot application, including build optimization strategies and best practices for production deployments.

## Table of Contents

1. [Build Performance and Memory Optimization Guidelines](#build-performance-and-memory-optimization-guidelines)
2. [Environment Configuration](#environment-configuration)
3. [Database Setup](#database-setup)
4. [Deployment Checklist](#deployment-checklist)
5. [Troubleshooting](#troubleshooting)

## Build Performance and Memory Optimization Guidelines

Building a Next.js 15.3.2 project with numerous dependencies (e.g. Vercel's AI SDK providers, OpenAI/Google SDKs, vector stores, UI libraries, etc.) can strain Vercel's build memory and slow down or even fail deployments. This section provides practical strategies to optimize build performance and prevent memory-related issues.

### AI SDK Usage

**Only include AI providers that are actively in use**
- Remove unused `@ai-sdk/*` packages from your dependencies
- Audit your bundle to identify which AI providers are actually being used
- Each unused provider adds unnecessary weight to your build

**Prefer dynamic import() for heavy AI modules**
```typescript
// Instead of top-level imports
import { GoogleAI } from '@ai-sdk/google';

// Use dynamic imports in functions
const { GoogleAI } = await import('@ai-sdk/google');
```

**Ensure Zod is ≥4.1.8**
- AI SDK v5 has known TypeScript performance issues with older Zod versions
- Update to Zod 4.1.8+ to avoid "excessively deep" type instantiations
- This prevents slow or hanging type checks during build

**When possible, offload AI logic to serverless APIs outside the Next.js bundle**
- Consider using Vercel's AI Gateway for model provider calls
- Deploy separate API services for heavy AI tasks
- Keep your Next.js app lightweight by externalizing AI processing

### TypeScript and ESLint Settings

**Set build optimization flags in next.config.js**
```javascript
// next.config.js
module.exports = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};
```
⚠️ **Note**: Use these settings with caution. Still run linting and type checks in CI/CD pipelines to catch issues.

**Use "skipLibCheck": true in tsconfig.json**
```json
{
  "compilerOptions": {
    "skipLibCheck": true
  }
}
```
This tells TypeScript to skip type-checking declaration files in node_modules, reducing build memory usage.

**Ensure TypeScript is ≥5.2**
- Use TypeScript 5.2+ for optimized memory performance
- Consider using `"moduleResolution": "bundler"` or `"nodenext"` for ESM packages

### Memory-Saving Next.js Flags

**Enable experimental webpack memory optimizations**
```javascript
// next.config.js
module.exports = {
  experimental: {
    webpackMemoryOptimizations: true,
  },
};
```

**Disable source maps in production**
```javascript
// next.config.js
module.exports = {
  productionBrowserSourceMaps: false,
  experimental: {
    serverSourceMaps: false,
  },
};
```

**Use experimental.optimizePackageImports for large libraries**
```javascript
// next.config.js
module.exports = {
  experimental: {
    optimizePackageImports: [
      'date-fns',
      'lodash',
      'lucide-react',
      'googleapis',
      '@aws-sdk/client-s3',
    ],
  },
};
```

### Runtime Config and Environment Variables

**Guard usage of process.env.* to prevent build failures**
```typescript
// Bad: Can cause build failures if env var is missing
const db = connectToDatabase(process.env.DATABASE_URL);

// Good: Guard with fallbacks or lazy initialization
const db = process.env.DATABASE_URL 
  ? connectToDatabase(process.env.DATABASE_URL)
  : null;

// Or use lazy initialization
const getDatabase = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  return connectToDatabase(process.env.DATABASE_URL);
};
```

**Never initialize DB or AI clients at the module level**
```typescript
// Bad: Module-level initialization
const db = new Database(process.env.DATABASE_URL);

// Good: Lazy initialization inside functions
const getDb = async () => {
  const { Database } = await import('@/lib/database');
  return new Database(process.env.DATABASE_URL);
};
```

### Bundle and Function Limits

**Avoid embedding vector stores or large static assets in the build**
- Store large data externally (databases, CDN, etc.)
- Use runtime fetching instead of build-time imports
- Keep your bundle focused on code, not data

**Confirm serverless functions stay under the 250MB bundle size limit**
- Use bundle analysis tools to monitor function sizes
- Implement code splitting for large dependencies
- Consider splitting functionality across multiple functions

**Use ISR or dynamic = "force-dynamic" for AI-heavy pages**
```typescript
// For pages that shouldn't be statically generated
export const dynamic = 'force-dynamic';

// Or use ISR for pages that can be cached
export const revalidate = 3600; // 1 hour
```

### Advanced Optimization Strategies

**Increase Node memory if needed**
Set `NODE_OPTIONS="--max-old-space-size=6144"` in your Vercel environment variables to allocate ~6GB to the Node heap during builds.

**Use bundle analysis to identify optimization opportunities**
```bash
# Install bundle analyzer
npm install --save-dev @next/bundle-analyzer

# Add to next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({
  // your existing config
});
```

**Monitor build performance**
- Use Vercel's Build Diagnostics in the Observability tab
- Run `next build --experimental-debug-memory-usage` locally to profile memory usage
- Track build times and memory usage over time

## Environment Configuration

### Required Environment Variables

**Core Application**
```bash
# Database
DATABASE_URL=postgresql://username:password@host:port/database

# AI Providers
OPENAI_API_KEY=your_openai_key
GOOGLE_AI_API_KEY=your_google_ai_key

# Application
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=https://your-domain.com
```

**Optional AI Providers**
```bash
# Additional AI providers (only if used)
ANTHROPIC_API_KEY=your_anthropic_key
GROQ_API_KEY=your_groq_key
```

**External Services**
```bash
# Google Maps (if using location features)
EA_GOOGLE_MAPS_API_KEY=your_maps_key

# Vector Database (if using external vector store)
VECTOR_DB_URL=your_vector_db_url
```

### Vercel Configuration

**Environment Variables Setup**
1. Go to your Vercel project dashboard
2. Navigate to Settings > Environment Variables
3. Add all required variables for Production, Preview, and Development
4. Ensure sensitive variables are marked as "Encrypted"

**Build Settings**
```json
{
  "buildCommand": "pnpm run build",
  "installCommand": "pnpm install",
  "framework": "nextjs"
}
```

## Database Setup

### PostgreSQL with pgvector

**CloudSQL Setup**
1. Create a CloudSQL PostgreSQL instance
2. Enable the pgvector extension
3. Configure connection settings
4. Update DATABASE_URL environment variable

**Local Development**
```bash
# Using Docker
docker run --name postgres-vector -e POSTGRES_PASSWORD=password -p 5432:5432 -d pgvector/pgvector:pg15

# Connection string
DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres
```

**Database Migrations**
```bash
# Run migrations
pnpm run db:migrate

# Seed test data (optional)
pnpm run db:seed
```

## Deployment Checklist

### Pre-Deployment

- [ ] All environment variables configured in Vercel
- [ ] Database connection tested
- [ ] Build optimization settings applied
- [ ] Bundle size analysis completed
- [ ] Type checking and linting passed in CI
- [ ] Test deployment on preview branch

### Post-Deployment

- [ ] Health check endpoint responding
- [ ] Database connections working
- [ ] AI providers responding correctly
- [ ] Error monitoring configured
- [ ] Performance monitoring active
- [ ] Backup strategy in place

## Troubleshooting

### Common Build Issues

**Out of Memory (OOM) Errors**
- Enable `webpackMemoryOptimizations: true`
- Increase Node memory with `NODE_OPTIONS`
- Remove unused dependencies
- Use dynamic imports for heavy modules

**Type Checking Timeouts**
- Set `skipLibCheck: true` in tsconfig.json
- Update Zod to ≥4.1.8
- Consider disabling type checking during builds

**Environment Variable Errors**
- Ensure all required env vars are set in Vercel
- Use fallback values for optional variables
- Guard env var usage with proper error handling

**Bundle Size Exceeded**
- Use bundle analyzer to identify large dependencies
- Implement code splitting
- Remove unused AI providers
- Use dynamic imports for heavy modules

### Performance Monitoring

**Vercel Analytics**
- Monitor Core Web Vitals
- Track function execution times
- Monitor memory usage patterns

**Error Tracking**
- Set up error monitoring (Sentry, LogRocket, etc.)
- Monitor API response times
- Track build success rates

**Database Performance**
- Monitor query performance
- Set up connection pooling
- Implement proper indexing

---

**Last Updated**: December 2024  
**Version**: 1.0.0

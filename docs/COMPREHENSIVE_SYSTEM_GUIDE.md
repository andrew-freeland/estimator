# 🏗️ Estimator Assistant MCP - Comprehensive System Guide

**Version**: 1.0  
**Last Updated**: December 2024  
**Status**: Production Ready

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Architecture & Components](#architecture--components)
3. [Environment Configuration](#environment-configuration)
4. [Middleware & Database Fixes](#middleware--database-fixes)
5. [Validation Systems](#validation-systems)
6. [Deployment Guide](#deployment-guide)
7. [Development Setup](#development-setup)
8. [Troubleshooting](#troubleshooting)
9. [Monitoring & Maintenance](#monitoring--maintenance)

---

## 🎯 System Overview

The Estimator Assistant MCP is a modular, secure, cloud-deployable construction estimating application built on Next.js 15.3.2 with TypeScript, featuring AI-powered cost estimation, document analysis, and voice transcription capabilities.

### Key Features

- **AI-Powered Cost Estimation**: Detailed breakdowns for labor, materials, and equipment
- **Document Analysis**: Upload and analyze construction plans and specifications
- **Location Intelligence**: Regional cost differences and travel expenses
- **Voice Notes**: Automatic transcription for project documentation
- **Market Rates**: Current labor rates and material costs
- **Timeline Planning**: Project duration estimation and scheduling

### Technology Stack

- **Framework**: Next.js 15.3.2 (App Router) + TypeScript
- **UI**: assistant-ui components for streaming chat
- **Database**: PostgreSQL with pgvector extension
- **Storage**: Google Cloud Storage (GCS)
- **AI**: OpenAI GPT models + text-embedding-3-large
- **Authentication**: better-auth
- **Deployment**: Vercel/Google Cloud Run

---

## 🏗️ Architecture & Components

### Core Components

```
/app          # Next.js app routes
/components   # Chat + UI components (assistant-ui)
/agents       # AI agents (ingestion, rates, explainer)
/mcp          # MCP tools (Google, Maps)
/lib          # Utilities, GCP adapters, db wrappers
/lib/gcp      # GCS + CloudSQL client configs
/vectorstore  # Embeddings + retrieval layer
/public       # Static assets
```

### AI Agents

- **`ingestion_agent`** → Normalize and embed files/transcripts
- **`rates_agent`** → Retrieve labor, materials, schedule, location data
- **`explainer_agent`** → Produce reasoning and uncertainty narratives

### MCP Tools

- **`/mcp/google.ts`** → Workspace files and Sheets rates
- **`/mcp/maps.ts`** → Travel distance and time modifiers

---

## ⚙️ Environment Configuration

### Build-Safe Environment Validator

The application uses a centralized environment validator (`src/lib/env.ts`) that ensures all required environment variables are properly configured while remaining build-safe.

#### Key Features

- **Build-Safe**: Uses relaxed validation during build time to prevent build failures
- **Runtime Validation**: Strict validation when the application actually runs
- **Type Safety**: Full TypeScript support with Zod validation
- **Clear Error Messages**: Helpful error messages for missing or invalid variables

#### Required Environment Variables

**Core Application:**
```bash
NODE_ENV=development|production|test
BASE_URL=http://localhost:3000
```

**Database:**
```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/estimator_assistant
POSTGRES_URL=postgresql://postgres:password@localhost:5432/estimator_assistant
EA_DATABASE_URL=postgresql://postgres:password@localhost:5432/estimator_assistant  # Optional override
```

**Google Cloud Platform:**
```bash
EA_GCP_PROJECT_ID=your-gcp-project-id
EA_GCP_REGION=us-central1
EA_GCS_BUCKET_NAME=estimator-assistant-files
```

**AI/LLM Configuration:**
```bash
OPENAI_API_KEY=sk-your-openai-api-key
EA_EMBEDDING_MODEL=text-embedding-3-large
EA_TRANSCRIPTION_MODEL=whisper-1
EA_EXPLAINER_MODEL=gpt-4o
```

**Authentication:**
```bash
BETTER_AUTH_SECRET=your-super-secure-secret-key-here  # Min 32 chars
BETTER_AUTH_URL=http://localhost:3000
```

**Optional Services:**
```bash
EA_GOOGLE_CLIENT_ID=your-google-client-id
EA_GOOGLE_CLIENT_SECRET=your-google-client-secret
EA_GOOGLE_API_KEY=your-google-api-key
EA_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
REDIS_URL=redis://localhost:6379
```

**Feature Flags:**
```bash
ENABLE_VOICE_TRANSCRIPTION=true
ENABLE_GOOGLE_WORKSPACE=true
ENABLE_MAPS=true
ENABLE_VECTOR_SEARCH=true
```

### Environment Variable Usage Patterns

**✅ CORRECT - Runtime-safe lazy initialization:**
```typescript
async function getDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return new Database(url);
}
```

**❌ INCORRECT - Module-level initialization:**
```typescript
// This will cause build failures if env vars are missing
const db = new Database(process.env.DATABASE_URL);
```

---

## 🔧 Middleware & Database Fixes

### Critical Issues Resolved

#### 1. Middleware Edge Runtime Compatibility

**Problem**: `getSessionCookie` from `better-auth/cookies` was causing `__import_unsupported` redefinition errors in Edge runtime.

**Solution**: Removed better-auth import and implemented direct cookie checking.

**Before (❌ Problematic):**
```typescript
import { getSessionCookie } from "better-auth/cookies";

export async function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  // ... rest of logic
}
```

**After (✅ Fixed):**
```typescript
export async function middleware(request: NextRequest) {
  // Edge runtime compatible session check
  const sessionCookie = request.cookies.get("ba-session")?.value;
  // ... rest of logic
}
```

#### 2. Database Connection Configuration

**Problem**: GitHub Actions CI was using `testuser` but connection strings referenced `root` user, causing "role root does not exist" errors.

**Solution**: Normalized database connection strings across all environments.

**CI Configuration (✅ Fixed):**
```yaml
env:
  POSTGRES_URL: postgresql://testuser:testpass@localhost:5432/better_chatbot_test
  DATABASE_URL: postgresql://testuser:testpass@localhost:5432/better_chatbot_test

services:
  postgres:
    image: postgres:17
    env:
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
      POSTGRES_DB: better_chatbot_test
```

**Enhanced Database Connection Code:**
```typescript
// Validate database URL format and user
try {
  const url = new URL(dbUrl);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`Invalid database protocol: ${url.protocol}`);
  }
  
  // Warn about common user issues
  if (url.username === "root" && process.env.NODE_ENV !== "production") {
    console.warn("⚠️ Using 'root' as database user. Consider using 'postgres' for better compatibility.");
  }
  
  pgDbInstance = drizzlePg(dbUrl);
} catch (error) {
  console.error("Invalid database URL:", error);
  // Handle gracefully
}
```

#### 3. Node Version Consistency

**Problem**: CI workflows were using Node 20 while package.json specified Node 22.

**Solution**: Updated all GitHub Actions workflows to use Node 22 consistently.

**Updated Workflows:**
- `.github/workflows/e2e-tests.yml`
- `.github/workflows/lint-and-type-check.yml`
- `.github/workflows/pr-check.yml`

#### 4. CI Reliability Improvements

**Added PostgreSQL Health Checks:**
```yaml
- name: Wait for PostgreSQL
  run: |
    for i in {1..20}; do
      if nc -z localhost 5432; then
        echo "PostgreSQL is ready!"
        break
      fi
      echo "Waiting for PostgreSQL... (attempt $i/20)"
      sleep 2
    done
```

---

## 🧪 Validation Systems

### Automated Validation Scripts

#### 1. `validate-fixes.js` - Core Validation Suite

**Purpose**: Comprehensive validation of all middleware and database fixes

**Usage**:
```bash
node validate-fixes.js
```

**Tests**:
- Middleware Edge runtime compatibility
- Database connection string validation
- Node version consistency
- Environment variable structure
- Cookie handling functionality

#### 2. `test-endpoints.js` - HTTP Endpoint Testing

**Purpose**: Tests actual HTTP endpoint behavior after middleware fixes

**Usage**:
```bash
node test-endpoints.js
```

**Tests**:
- `/ping` → expects 200 with "pong" body
- `/sign-in` → expects 302 redirect when no session
- `/estimator` → expects 302 redirect when no session, 200 with session
- `/api/health` → expects 302 redirect when no session

#### 3. `check-logs.js` - Log Analysis & Error Detection

**Purpose**: Analyzes logs for specific errors that were fixed

**Usage**:
```bash
node check-logs.js
```

**Checks for absence of**:
- `Cannot redefine property: __import_unsupported`
- `MIDDLEWARE_INVOCATION_FAILED`
- `role "root" does not exist`
- `getSessionCookie is not a function`
- `better-auth/cookies import error`
- `Edge runtime import error`

### Post-Deployment Validation Checklist

#### Pre-Deployment Checks

1. **Run Core Validation**:
   ```bash
   node validate-fixes.js
   ```
   - Should show all ✅ PASS results
   - No ❌ FAIL results

2. **Test Endpoints**:
   ```bash
   node test-endpoints.js
   ```
   - All endpoint tests should pass
   - Middleware logic should work correctly

3. **Verify Build**:
   ```bash
   pnpm build:local
   ```
   - Should complete without middleware errors
   - No `__import_unsupported` errors

#### Post-Deployment Checks

1. **Hit Critical URLs**:
   ```bash
   curl -I http://your-domain.com/ping        # Should return 200
   curl -I http://your-domain.com/sign-in     # Should return 200 or 302
   curl -I http://your-domain.com/estimator   # Should return 302 (redirect)
   curl -I http://your-domain.com/api/health  # Should return 200 or 302
   ```

2. **Check Server Logs**:
   - No `Cannot redefine property: __import_unsupported`
   - No `MIDDLEWARE_INVOCATION_FAILED`
   - No `role "root" does not exist`
   - No database connection errors

3. **Verify Node Version**:
   - Runtime should use Node v22+ (or v24+)
   - Check with `process.version` in logs

4. **Test Cookie Functionality**:
   - `ba-session` cookie should appear on successful sign-in
   - Middleware should detect session correctly

---

## 🚀 Deployment Guide

### Prerequisites

- Node.js 22+ and pnpm
- Google Cloud Platform account
- OpenAI API key
- Google Workspace API access (optional)

### Local Development Setup

```bash
# Clone repository
git clone <repository-url>
cd better-chatbot

# Install dependencies
pnpm install

# Copy environment file
cp env.example .env.local

# Configure environment variables (see Environment Configuration section)

# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev
```

### Vercel Deployment

1. **Connect Repository**:
   - Link your GitHub repository to Vercel
   - Configure build settings

2. **Environment Variables**:
   - Add all required environment variables in Vercel dashboard
   - Ensure sensitive variables are marked as "Encrypted"

3. **Build Settings**:
   ```json
   {
     "buildCommand": "pnpm run build",
     "installCommand": "pnpm install",
     "framework": "nextjs"
   }
   ```

4. **Deploy**:
   - Push to main branch triggers automatic deployment
   - Monitor build logs for any issues

### Google Cloud Run Deployment

1. **Build and Push**:
   ```bash
   docker build -t estimator-assistant .
   docker tag estimator-assistant gcr.io/your-project-id/estimator-assistant:latest
   docker push gcr.io/your-project-id/estimator-assistant:latest
   ```

2. **Deploy to Cloud Run**:
   ```bash
   gcloud run deploy estimator-assistant \
     --image=gcr.io/your-project-id/estimator-assistant:latest \
     --region=us-central1 \
     --platform=managed \
     --allow-unauthenticated \
     --min-instances=1 \
     --max-instances=5 \
     --memory=2Gi \
     --cpu=2 \
     --timeout=900 \
     --concurrency=100 \
     --port=3000
   ```

### Build Optimization

**Next.js Configuration**:
```javascript
// next.config.js
module.exports = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    webpackMemoryOptimizations: true,
    optimizePackageImports: [
      'date-fns',
      'lodash',
      'lucide-react',
      'googleapis',
      '@aws-sdk/client-s3',
    ],
  },
  productionBrowserSourceMaps: false,
  experimental: {
    serverSourceMaps: false,
  },
};
```

**TypeScript Configuration**:
```json
{
  "compilerOptions": {
    "skipLibCheck": true
  }
}
```

---

## 🛠️ Development Setup

### Prerequisites

- Node.js 22+ and pnpm
- PostgreSQL with pgvector extension
- Google Cloud Platform account
- OpenAI API key

### Installation

```bash
# Install dependencies
pnpm install

# Set up environment
cp env.example .env.local
# Edit .env.local with your configuration

# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev
```

### Available Scripts

```bash
# Development
pnpm dev                    # Start development server
pnpm dev:turbopack         # Start with Turbopack
pnpm dev:https             # Start with HTTPS

# Building
pnpm build                 # Production build
pnpm build:local          # Local build with NO_HTTPS=1
pnpm start                # Start production server

# Testing
pnpm test                 # Run unit tests
pnpm test:e2e             # Run E2E tests
pnpm test:e2e:ui          # Run E2E tests with UI
pnpm test:e2e:seed        # Seed test users
pnpm test:e2e:clean       # Clean test data

# Database
pnpm db:generate          # Generate migrations
pnpm db:push              # Push schema changes
pnpm db:migrate           # Run migrations
pnpm db:studio            # Open Drizzle Studio

# Linting & Formatting
pnpm lint                 # Run linting
pnpm lint:fix             # Fix linting issues
pnpm format               # Format code
pnpm check-types          # Type checking

# Docker
pnpm docker-compose:up    # Start Docker services
pnpm docker-compose:down  # Stop Docker services
pnpm docker:pg            # Start PostgreSQL container
pnpm docker:redis         # Start Redis container
```

### Project Structure

```
src/
├── app/                  # Next.js app router
│   ├── (auth)/          # Authentication pages
│   ├── (chat)/          # Chat interface
│   ├── (public)/        # Public pages
│   └── api/             # API routes
├── components/          # React components
│   ├── ui/              # Base UI components
│   ├── agent/           # Agent-specific components
│   └── layouts/         # Layout components
├── lib/                 # Utilities and configurations
│   ├── db/              # Database configurations
│   ├── gcp/             # Google Cloud Platform
│   └── auth/            # Authentication
├── agents/              # AI agents
├── mcp/                 # MCP tools
├── hooks/               # React hooks
├── types/               # TypeScript types
└── vectorstore/         # Vector storage
```

---

## 🔍 Troubleshooting

### Common Issues & Solutions

#### 1. Middleware Errors

**Symptoms**: `Cannot redefine property: __import_unsupported`

**Solution**: 
- Ensure middleware.ts doesn't import better-auth or Node.js modules
- Use direct cookie checking instead of better-auth imports
- Run validation scripts to verify fixes

#### 2. Database Connection Issues

**Symptoms**: `role "root" does not exist`

**Solution**: 
- Use `postgres` user instead of `root`
- Update CI environment variables
- Check database URL format
- Verify PostgreSQL service is running

#### 3. Node Version Mismatch

**Symptoms**: Engine warnings in logs

**Solution**: 
- Update CI workflows to Node 22
- Ensure package.json engines field is correct
- Use consistent Node version across environments

#### 4. Build Failures

**Symptoms**: Out of memory errors, type checking timeouts

**Solution**:
- Enable `webpackMemoryOptimizations: true`
- Set `skipLibCheck: true` in tsconfig.json
- Use dynamic imports for heavy modules
- Remove unused dependencies

#### 5. Environment Variable Errors

**Symptoms**: Build failures due to missing env vars

**Solution**:
- Use build-safe environment validation
- Implement lazy initialization patterns
- Guard env var usage with proper error handling

### Debug Mode

Enable debug logging:
```bash
# Update environment variables
LOG_LEVEL=debug
DEBUG=true
```

### Performance Issues

Monitor and adjust:
```bash
# Check current metrics
curl "$SERVICE_URL/api/metrics" | jq '.data.performance'

# Adjust scaling (Cloud Run)
gcloud run services update estimator-assistant \
  --region=us-central1 \
  --memory=4Gi \
  --cpu=4
```

---

## 📊 Monitoring & Maintenance

### Key Metrics to Monitor

1. **Middleware Success Rate**: Should be 100%
2. **Database Connection Success**: Should be 100%
3. **Endpoint Response Times**: Should be < 200ms
4. **Error Rate**: Should be 0% for fixed issues

### Alert Conditions

Set up alerts for:
- Any occurrence of `__import_unsupported` errors
- Database connection failures
- Middleware invocation failures
- Node version mismatches

### Regular Maintenance

#### Daily
- Run `validate-fixes.js` in CI
- Monitor error rates and response times

#### Weekly
- Full endpoint testing with `test-endpoints.js`
- Review performance metrics

#### Monthly
- Comprehensive log analysis with `check-logs.js`
- Update dependencies and security patches

### Health Checks

**Application Health**:
```bash
curl -f "$SERVICE_URL/api/health"
```

**Database Health**:
```bash
curl -f "$SERVICE_URL/api/metrics"
```

**Middleware Health**:
```bash
curl -I "$SERVICE_URL/ping"  # Should return 200
```

### Backup and Recovery

**Database Backups**:
```bash
# Create backup
gcloud sql backups create \
  --instance=estimator-assistant-db \
  --description="Manual backup"

# List backups
gcloud sql backups list --instance=estimator-assistant-db
```

**Application Updates**:
```bash
# Pull latest changes
git pull origin main

# Rebuild and redeploy
./scripts/deploy-cloudrun.sh
```

---

## 🎯 Success Criteria

The system is working correctly when:

- ✅ All validation scripts return PASS
- ✅ No critical error patterns found in logs
- ✅ All endpoints respond as expected
- ✅ Node version is consistent across environments
- ✅ Database connections work reliably
- ✅ Cookie handling functions correctly
- ✅ Middleware executes without Edge runtime errors
- ✅ Build process completes successfully
- ✅ CI/CD pipelines pass all checks

---

## 📞 Support & Resources

### Getting Help

1. Check the [health endpoint](/api/health) for system status
2. Review logs in Cloud Logging or Vercel dashboard
3. Check metrics at `/api/metrics`
4. Verify environment variables are set correctly
5. Run validation scripts to identify issues

### Useful Commands

```bash
# Service status
gcloud run services describe estimator-assistant --region=us-central1

# Recent logs
gcloud logging read "resource.type=cloud_run_revision" --limit=100

# Environment variables
gcloud run services describe estimator-assistant --region=us-central1 --format="value(spec.template.spec.template.spec.containers[0].env[].name,spec.template.spec.template.spec.containers[0].env[].value)"
```

### Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Deployment Guide](https://vercel.com/docs)
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [OpenAI API Documentation](https://platform.openai.com/docs)

---

**Built with ❤️ for the construction industry**

*This comprehensive guide consolidates all system documentation, validation procedures, and deployment information in one place for easy reference by development teams and new contributors.*

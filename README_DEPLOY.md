# Estimator Assistant MCP - Deployment Guide

This guide covers deploying the Estimator Assistant MCP to Google Cloud Platform using Cloud Run.

## 🏗️ Architecture Overview

The Estimator Assistant MCP is deployed as a containerized Next.js application on Google Cloud Run with the following components:

- **Cloud Run**: Serverless container hosting
- **Cloud SQL**: PostgreSQL database with pgvector extension
- **Cloud Storage**: File and document storage
- **Artifact Registry**: Container image storage
- **VPC Connector**: Secure connection to Cloud SQL

## 📋 Prerequisites

### Required Tools
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (gcloud)
- [Docker](https://docs.docker.com/get-docker/)
- [Node.js 18+](https://nodejs.org/)
- [pnpm](https://pnpm.io/installation)

### Required GCP Services
- Cloud Run
- Cloud SQL (PostgreSQL)
- Cloud Storage
- Artifact Registry
- VPC Access Connector

## 🔧 Environment Setup

### 1. GCP Project Setup

```bash
# Set your project ID
export EA_GCP_PROJECT_ID="your-project-id"
gcloud config set project $EA_GCP_PROJECT_ID

# Enable required APIs
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  artifactregistry.googleapis.com \
  vpcaccess.googleapis.com \
  cloudbuild.googleapis.com
```

### 2. Database Setup

```bash
# Create Cloud SQL instance
gcloud sql instances create estimator-assistant-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --storage-type=SSD \
  --storage-size=10GB \
  --backup \
  --enable-ip-alias

# Create database
gcloud sql databases create estimator_assistant \
  --instance=estimator-assistant-db

# Create user
gcloud sql users create estimator_user \
  --instance=estimator-assistant-db \
  --password=your-secure-password

# Get connection name
gcloud sql instances describe estimator-assistant-db \
  --format="value(connectionName)"
```

### 3. Storage Setup

```bash
# Create Cloud Storage bucket
gsutil mb gs://your-project-estimator-assistant

# Set bucket permissions
gsutil iam ch allUsers:objectViewer gs://your-project-estimator-assistant
```

### 4. Environment Variables

Create a `.env.local` file with the following variables:

```bash
# Core Configuration
NODE_ENV=production
BASE_URL=https://your-service-url.run.app

# Database
EA_DATABASE_URL=postgresql://estimator_user:your-secure-password@/estimator_assistant?host=/cloudsql/your-project:us-central1:estimator-assistant-db
DATABASE_URL=${EA_DATABASE_URL}

# GCP Configuration
EA_GCP_PROJECT_ID=your-project-id
EA_GCP_REGION=us-central1
EA_GCS_BUCKET_NAME=your-project-estimator-assistant

# AI/LLM Configuration
OPENAI_API_KEY=sk-your-openai-api-key
EA_EMBEDDING_MODEL=text-embedding-3-large
EA_TRANSCRIPTION_MODEL=whisper-1
EA_EXPLAINER_MODEL=gpt-4o

# Authentication
BETTER_AUTH_SECRET=your-32-character-secret-key
BETTER_AUTH_URL=https://your-service-url.run.app

# External Services (Optional)
EA_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
EA_GOOGLE_CLIENT_ID=your-google-oauth-client-id
EA_GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
EA_GOOGLE_API_KEY=your-google-api-key

# Feature Flags
ENABLE_VOICE_TRANSCRIPTION=true
ENABLE_GOOGLE_WORKSPACE=false
ENABLE_MAPS=true
ENABLE_VECTOR_SEARCH=true

# Performance
MAX_FILE_SIZE=104857600
MAX_CONCURRENT_EMBEDDINGS=5
EMBEDDING_BATCH_SIZE=10

# Logging
LOG_LEVEL=info
STRUCTURED_LOGGING=true
```

## 🚀 Deployment

### Automated Deployment

Use the provided deployment script:

```bash
# Make script executable
chmod +x scripts/deploy-cloudrun.sh

# Deploy to Cloud Run
./scripts/deploy-cloudrun.sh

# Or with custom configuration
EA_GCP_PROJECT_ID=your-project-id \
EA_GCP_REGION=us-central1 \
EA_SERVICE_NAME=estimator-assistant \
./scripts/deploy-cloudrun.sh
```

### Manual Deployment

If you prefer manual deployment:

```bash
# 1. Build and push Docker image
docker build -t estimator-assistant .
docker tag estimator-assistant gcr.io/your-project-id/estimator-assistant:latest
docker push gcr.io/your-project-id/estimator-assistant:latest

# 2. Deploy to Cloud Run
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
  --port=3000 \
  --vpc-connector=estimator-assistant-vpc-connector \
  --set-env-vars="NODE_ENV=production,EA_GCP_PROJECT_ID=your-project-id"
```

## 🔍 Verification

### Health Check

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe estimator-assistant \
  --region=us-central1 \
  --format="value(status.url)")

# Test health endpoint
curl -f "$SERVICE_URL/api/health"

# Test metrics endpoint
curl -f "$SERVICE_URL/api/metrics"
```

### Database Migration

```bash
# Run database migrations
npm run db:push

# Or manually
npx drizzle-kit push
```

### Test Endpoints

```bash
# Test RAG retrieval
curl -X POST "$SERVICE_URL/api/retrieve" \
  -H "Content-Type: application/json" \
  -H "x-client-id: test-client" \
  -d '{"query": "construction costs", "projectId": "test-project"}'

# Test estimation
curl -X POST "$SERVICE_URL/api/estimate" \
  -H "Content-Type: application/json" \
  -H "x-client-id: test-client" \
  -d '{"projectDescription": "Residential construction project", "clientId": "test-client"}'
```

## 📊 Monitoring

### Cloud Run Metrics

Monitor your deployment in the [Cloud Run Console](https://console.cloud.google.com/run):

- **Request count and latency**
- **Error rates**
- **Memory and CPU usage**
- **Instance count**

### Application Metrics

Access application-specific metrics at `/api/metrics`:

- Document counts by type
- Job statistics by status
- Estimate confidence distributions
- Tool usage statistics
- Performance metrics

### Logging

View logs in [Cloud Logging](https://console.cloud.google.com/logs):

```bash
# View recent logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=estimator-assistant" \
  --limit=50 \
  --format=json
```

## 🔧 Configuration

### Scaling Configuration

Adjust scaling parameters in the deployment script:

```bash
# In scripts/deploy-cloudrun.sh
--min-instances="1"      # Minimum instances (0 for serverless)
--max-instances="5"      # Maximum instances
--concurrency="100"      # Requests per instance
--memory="2Gi"           # Memory per instance
--cpu="2"                # CPU per instance
```

### Environment Variables

Update environment variables:

```bash
# Update environment variables
gcloud run services update estimator-assistant \
  --region=us-central1 \
  --set-env-vars="NEW_VAR=value"
```

## 🛠️ Troubleshooting

### Common Issues

#### Database Connection Issues

```bash
# Check VPC connector
gcloud compute networks vpc-access connectors list

# Test database connectivity
gcloud sql connect estimator-assistant-db --user=estimator_user
```

#### Storage Access Issues

```bash
# Check bucket permissions
gsutil iam get gs://your-bucket-name

# Test storage access
gsutil ls gs://your-bucket-name
```

#### Build Issues

```bash
# Check Docker build locally
docker build -t estimator-assistant .

# Test container locally
docker run -p 3000:3000 estimator-assistant
```

### Debug Mode

Enable debug logging:

```bash
# Update environment variables
gcloud run services update estimator-assistant \
  --region=us-central1 \
  --set-env-vars="LOG_LEVEL=debug,DEBUG=true"
```

### Performance Issues

Monitor and adjust:

```bash
# Check current metrics
curl "$SERVICE_URL/api/metrics" | jq '.data.performance'

# Adjust scaling
gcloud run services update estimator-assistant \
  --region=us-central1 \
  --memory=4Gi \
  --cpu=4
```

## 🔄 Updates and Maintenance

### Updating the Application

```bash
# Pull latest changes
git pull origin main

# Rebuild and redeploy
./scripts/deploy-cloudrun.sh
```

### Database Migrations

```bash
# Generate migration
npm run db:generate

# Apply migration
npm run db:push
```

### Backup and Recovery

```bash
# Create database backup
gcloud sql backups create \
  --instance=estimator-assistant-db \
  --description="Manual backup before update"

# List backups
gcloud sql backups list --instance=estimator-assistant-db
```

## 🔐 Security

### Network Security

- VPC connector provides secure connection to Cloud SQL
- Cloud Run instances are isolated and ephemeral
- No direct database access from internet

### Data Security

- All data encrypted in transit and at rest
- PII redaction in file processing
- Multi-tenant data isolation
- Audit logging for all operations

### Access Control

- Authentication required for all API endpoints
- Permission-based access control
- Rate limiting on external API calls
- Input validation and sanitization

## 📈 Cost Optimization

### Resource Optimization

```bash
# Use smaller instances for development
gcloud run services update estimator-assistant \
  --region=us-central1 \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=0
```

### Monitoring Costs

- Monitor Cloud Run usage in [Cloud Console](https://console.cloud.google.com/run)
- Set up billing alerts
- Use Cloud SQL instance sizing recommendations

## 🆘 Support

### Getting Help

1. Check the [health endpoint](/api/health) for system status
2. Review logs in Cloud Logging
3. Check metrics at `/api/metrics`
4. Verify environment variables are set correctly

### Useful Commands

```bash
# Service status
gcloud run services describe estimator-assistant --region=us-central1

# Recent logs
gcloud logging read "resource.type=cloud_run_revision" --limit=100

# Environment variables
gcloud run services describe estimator-assistant --region=us-central1 --format="value(spec.template.spec.template.spec.containers[0].env[].name,spec.template.spec.template.spec.containers[0].env[].value)"
```

---

## 📝 Additional Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud SQL Documentation](https://cloud.google.com/sql/docs)
- [Cloud Storage Documentation](https://cloud.google.com/storage/docs)
- [Next.js Deployment Guide](https://nextjs.org/docs/deployment)

For questions or issues, please refer to the project documentation or create an issue in the repository.

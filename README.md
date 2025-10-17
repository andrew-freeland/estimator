# 🏗️ Estimator Assistant MCP

A modular, secure, cloud-deployable **Estimator Assistant MCP** for construction estimating — capable of ingesting files, transcribing voice notes, referencing Google Workspace data, and explaining project estimates with confidence and reasoning.

## 🚀 Features

- **AI-Powered Cost Estimation**: Get detailed breakdowns for labor, materials, and equipment with confidence levels
- **Document Analysis**: Upload and analyze construction plans, specifications, and project documents automatically
- **Location Intelligence**: Account for regional cost differences, travel expenses, and local market conditions
- **Voice Notes**: Record voice notes and get automatic transcription for quick project documentation
- **Market Rates**: Access current labor rates, material costs, and equipment pricing from multiple sources
- **Timeline Planning**: Estimate project duration and create realistic schedules based on historical data

## 🏗️ Architecture

### Core Components

- **Framework**: Next.js (App Router) + TypeScript + Vercel AI SDK
- **UI Layer**: [assistant-ui](https://github.com/assistant-ui/assistant-ui) components for modular, production-grade streaming
- **Storage**: Google Cloud Storage (GCS) with signed URL support
- **Database**: Cloud SQL (Postgres) with pgvector extension for RAG embedding
- **Voice Pipeline**: Realtime Voice setup with Whisper (server-side only)
- **Embedding**: OpenAI `text-embedding-3-large` with metadata tracking

### MCP Tools

- **`/mcp/google.ts`** → Workspace files and Sheets rates
- **`/mcp/maps.ts`** → Travel distance and time modifiers

### Agents

- **`ingestion_agent`** → Normalize and embed files/transcripts
- **`rates_agent`** → Retrieve labor, materials, schedule, location data
- **`explainer_agent`** → Produce reasoning and uncertainty narratives

## 🛠️ Setup

### Prerequisites

- Node.js 18+ and pnpm
- Google Cloud Platform account
- OpenAI API key
- Google Workspace API access (optional)

### Environment Configuration

Copy the example environment file and configure your variables:

```bash
cp env.example .env.local
```

Required environment variables:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Google Cloud Platform
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GCP_PROJECT_ID=your_gcp_project_id
GCP_REGION=us-central1
GCS_BUCKET_NAME=your_gcs_bucket_name
DATABASE_URL=postgresql://user:pass@host:5432/db

# External APIs (Optional)
GOOGLE_API_KEY=your_google_api_key

# AI Models
EMBEDDING_MODEL=text-embedding-3-large
TRANSCRIPTION_MODEL=whisper-1
```

### Installation

```bash
# Install dependencies
pnpm install

# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev
```

## 🐳 Docker Deployment

### Build and Run Locally

```bash
# Build the Docker image
docker build -t estimator-assistant .

# Run the container
docker run -p 3000:3000 estimator-assistant
```

### Deploy to Google Cloud Run

```bash
# Build and push to Google Container Registry
gcloud builds submit --tag gcr.io/PROJECT_ID/estimator-assistant

# Deploy to Cloud Run
gcloud run deploy estimator-assistant \
  --image gcr.io/PROJECT_ID/estimator-assistant \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

## 📁 Project Structure

```
/app          # Next.js app routes
/components   # Chat + UI components (assistant-ui)
/agents       # AI agents (ingestion, rates, explainer)
/mcp          # MCP tools (Buildertrend, Google, Maps)
/lib          # Utilities, GCP adapters, db wrappers
/lib/gcp      # GCS + CloudSQL client configs
/vectorstore  # Embeddings + retrieval layer
/public       # Static assets
```

## 🔐 Security & Compliance

- **Server-side LLM calls only** - No client-side API key exposure
- **Signed URLs** for secure file uploads
- **PII redaction** before embedding
- **Audit logs** for all tool calls
- **Least-privilege OAuth scopes**
- **Idempotent retry logic** for Cloud Run autoscaling
- **MIT-safe open-source compliance**

## 🤖 Usage

### Basic Chat Interface

Visit `/estimator` to access the main chat interface where you can:

- Upload construction documents and plans
- Ask questions about project costs and timelines
- Request detailed cost breakdowns
- Get location-specific rate information

### API Endpoints

- `POST /api/chat/estimator` - Main chat endpoint
- `POST /api/agents/ingestion` - Document processing
- `POST /api/agents/rates` - Rate information retrieval
- `POST /api/agents/explainer` - Estimate explanation

### Example Queries

```
"What's the cost to build a 2000 sq ft house in Austin, TX?"
"Upload this blueprint and give me a material breakdown"
"What are current labor rates for electricians in California?"
"Explain the cost assumptions in this estimate"
```

## 🧪 Development

### Running Tests

```bash
# Run unit tests
pnpm test

# Run E2E tests
pnpm test:e2e

# Run linting
pnpm lint
```

### Adding New MCP Tools

1. Create a new file in `/src/mcp/`
2. Implement the tool interface with proper error handling
3. Add to the tool registry in `/src/lib/ai/tools/`
4. Update environment configuration if needed

### Adding New Agents

1. Create a new file in `/src/agents/`
2. Implement the agent interface with proper validation
3. Add to the agent registry
4. Update the chat routing logic

## 📊 Monitoring & Analytics

The application includes built-in monitoring for:

- Chat interactions and response times
- File upload and processing metrics
- API usage and rate limiting
- Error tracking and debugging
- User engagement analytics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built on top of [better-chatbot](https://github.com/cgoinglove/better-chatbot)
- UI components from [assistant-ui](https://github.com/assistant-ui/assistant-ui)
- AI capabilities powered by OpenAI and Google Cloud Platform
- Construction industry insights from Google Workspace

## 📞 Support

For support, email support@estimator-assistant.com or join our Discord community.

---

**Built with ❤️ for the construction industry**# Vercel deployment test
# Deployment trigger - Thu Oct 16 14:57:18 PDT 2025
# Final deployment with environment variables configured - Thu Oct 16 15:13:09 PDT 2025
# Testing deployment with corrected Vercel configuration - Thu Oct 16 15:20:19 PDT 2025

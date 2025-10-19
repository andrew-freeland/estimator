# Estimator Assistant Orchestrator

The unified orchestrator for the Estimator Assistant MVP serves as the central entry point for all AI chat interactions.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Chat Frontend │───▶│   API Endpoint   │───▶│   Orchestrator  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
                                               ┌─────────────────┐
                                               │  System Prompt  │
                                               └─────────────────┘
                                                         │
                                                         ▼
                                               ┌─────────────────┐
                                               │   AI Model      │
                                               └─────────────────┘
```

## Core Components

### 1. Main Orchestrator (`index.ts`)
- **Purpose**: Central routing and coordination for all AI interactions
- **Current Agent**: Estimator Agent (default for MVP)
- **Future**: Support for Confidence Engine, Profitability Analyzer, etc.

### 2. System Prompts (`systemPrompt.ts`)
- **Purpose**: Defines agent behavior, tone, and response constraints
- **Features**: Context-aware prompts based on user location, project type, uploaded docs
- **Extensible**: Easy to add new agent prompts

### 3. Type Definitions (`types.ts`)
- **Purpose**: Comprehensive type safety for all orchestrator interactions
- **Features**: Message types, context interfaces, error handling
- **Validation**: Built-in request validation and error types

## Usage

### Basic Usage
```typescript
import { orchestrator } from '@/lib/orchestrator';

const response = await orchestrator({
  messages: [
    { role: 'user', content: 'What is the cost of building a house?' }
  ],
  threadId: 'thread-123',
  userId: 'user-456'
});
```

### With Context
```typescript
const response = await orchestrator({
  messages: messages,
  threadId: 'thread-123',
  userId: 'user-456',
  context: {
    location: 'San Francisco, CA',
    projectType: 'residential',
    uploadedDocs: [
      { name: 'plans.pdf', type: 'pdf', content: '...' }
    ]
  }
});
```

## Agent Registry

The orchestrator uses a registry pattern for easy agent management:

```typescript
const agentRegistry = {
  estimator: 'estimator',     // ✅ Active in MVP
  confidence: 'confidence',    // 🔮 Future
  profitability: 'profitability', // 🔮 Future
  contract: 'contract',       // 🔮 Future
};
```

## Error Handling

The orchestrator includes comprehensive error handling:

- **ValidationError**: Invalid request format (400)
- **AgentError**: Agent execution failures (500)
- **TimeoutError**: Agent timeout (408)
- **OrchestratorError**: General orchestrator errors (500)

## Testing

Run the orchestrator tests:

```bash
npm test src/lib/orchestrator
```

## Future Expansion

### Adding New Agents

1. **Add to Registry**: Update `agentRegistry` in `index.ts`
2. **Create Prompt**: Add prompt function in `systemPrompt.ts`
3. **Add Types**: Update `AgentType` in `types.ts`
4. **Implement Logic**: Add agent-specific processing logic

### Example: Adding Confidence Agent

```typescript
// 1. Update registry
const agentRegistry = {
  estimator: 'estimator',
  confidence: 'confidence', // ✅ New agent
};

// 2. Add prompt
function getConfidencePrompt(context?: SystemPromptContext): string {
  return `You are the Confidence Engine...`;
}

// 3. Add routing logic
if (agentType === 'confidence') {
  return await confidenceAgent.analyze(request);
}
```

## MVP Status

✅ **Completed**:
- Unified orchestrator entrypoint
- Estimator agent integration
- System prompt management
- Type safety and validation
- Error handling
- API integration

🔮 **Future**:
- Multi-agent coordination
- Agent-specific routing logic
- Advanced context management
- Performance monitoring
- Agent health checks

## Integration Points

- **Frontend**: `/app/(chat)/estimator/page.tsx`
- **API**: `/app/api/chat/estimator/route.ts`
- **Components**: `/components/estimator-chat.tsx`
- **Types**: `/types/` directory
- **Models**: `/lib/ai/models.ts`

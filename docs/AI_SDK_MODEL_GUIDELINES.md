# AI SDK Model & Streaming Guidelines (2025 Edition)

**Ensures compatibility with ai@5.0.60 and Vercel deployments.**

## Canonical AI SDK Usage Rules

### 1. ✅ Models must be LanguageModel objects

Always construct models using:

```ts
import { customModelProvider } from "@/lib/ai/models";
const model = customModelProvider.getModel({
  provider: "openai",
  model: aiConfig.explainerModel,
});
```

### 2. 🚫 Do not pass raw objects

Never pass raw objects like `{ provider, modelId }` directly into `streamText`.

### 3. ✅ Always use proper response methods

- `streamText` → `.toTextStreamResponse()`
- `streamObject` → `.toTextStreamResponse()`
- Never use `.toDataStreamResponse()`

### 4. ✅ Await streamText results

`streamText` returns a Promise — must be `await`ed before returning.

### 5. ✅ Preserve existing configuration

Keep existing `aiConfig`, `customModelProvider`, and configuration logic unchanged.
Do **not** rename variables, restructure folder layout, or modify runtime logic.

### 6. ✅ Required imports

Each fixed file should import both:

```ts
import { aiConfig } from "@/lib/config";
import { customModelProvider } from "@/lib/ai/models";
```

### 7. ✅ Model assignment pattern

Verify the model is assigned to a local variable before being passed into any SDK function.

### 8. ✅ Supported functions

Allowed functions: `streamText`, `generateText`, `generateObject`, `streamObject`.
All must use a proper `LanguageModel`.

### 9. 🚫 No behavioral changes

Never change business logic, prompt templates, or system messages.
Edits must be **syntactic compatibility fixes only**.

## Correct Fix Pattern

```ts
// AI SDK model fix
const model = customModelProvider.getModel({
  provider: "openai",
  model: aiConfig.explainerModel,
});

const result = await streamText({
  model,
  messages,
});

return result.toTextStreamResponse();
```

## Canonical Vercel Rules & Patterns (AI SDK v5)

### A. Model Objects (not plain `{ provider, modelId }`)

- `streamText`/`streamObject` must receive a **LanguageModel** instance (e.g., `openai('gpt-4o')`), not a custom POJO
- The `model` param type is explicitly `LanguageModel`
- Using official provider helpers (e.g., `@ai-sdk/openai`) guarantees compatible `LanguageModel` objects
- Keep model selection centralized in `customModelProvider` (must return valid `LanguageModel` objects)

### B. Streaming Helpers (what to return from route handlers)

- **Complex chat/tools** → `result.toUIMessageStreamResponse()` from `streamText`
- **Simple text** (no tools/extra metadata) → `result.toTextStreamResponse()`
- **UI streams** → Use `createUIMessageStream` + `createUIMessageStreamResponse` for advanced chat interfaces
- **Structured data** → `streamObject` + `.toTextStreamResponse()` for object streaming

### C. Error Handling (official guidance)

```ts
try {
  const result = await streamText({ model, messages });
  return result.toTextStreamResponse(); // or toUIMessageStreamResponse()
} catch (error) {
  logger.error("AI SDK error:", error);
  return new Response("Internal server error", { status: 500 });
}
```

### D. Tool Integration Patterns

- AI SDK tool calling is native to `streamText`/`generateText`
- Pass tools via the `tools` option to `streamText` so the SDK can orchestrate calls
- For MCP tools: Use `mcpClientsManager.tools()` and `mcpClientsManager.toolCall()`
- For workflow tools: Use `loadWorkFlowTools()` with proper context
- For app default tools: Use `loadAppDefaultTools()` with mentions

### Canonical Sources (for the Cursor agent)

- **streamText reference:** https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text
- **streamObject reference:** https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-object
- **Generating & Streaming Text (helpers):** https://ai-sdk.dev/docs/ai-sdk-core/generating-text
- **Providers & Models (LanguageModel contract):** https://ai-sdk.dev/docs/foundations/providers-and-models
- **OpenAI provider helper:** https://ai-sdk.dev/providers/ai-sdk-providers/openai
- **Next.js cookbook (returning UI streams from routes):** https://ai-sdk.dev/cookbook/next/stream-text
- **UI stream utilities:** 
  - createUIMessageStream → https://ai-sdk.dev/docs/reference/ai-sdk-ui/create-ui-message-stream
  - createUIMessageStreamResponse → https://ai-sdk.dev/docs/reference/ai-sdk-ui/create-ui-message-stream-response
- **Stream protocols (text vs data):** https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
- **Error handling (streams):** https://ai-sdk.dev/docs/ai-sdk-core/error-handling
- **Vercel streaming guide:** https://vercel.com/guides/streaming-from-llm

## Guardrails

- ❌ No renaming of exported functions, constants, or paths
- ❌ No new dependencies
- ✅ All imports should remain relative to `@/` aliases
- ✅ Each change must preserve runtime behavior exactly
- ✅ Add inline comments `// AI SDK model fix` where changes occur
- ✅ Leave console logging or telemetry untouched

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

## Additional Guidelines

### 11. ✅ UI Message Stream vs Text Stream

- Use `createUIMessageStream` + `createUIMessageStreamResponse` for complex chat interfaces with tool calls
- Use `streamText` + `.toTextStreamResponse()` for simple text responses
- Use `streamObject` + `.toTextStreamResponse()` for structured data streaming

### 12. ✅ Error Handling Patterns

```ts
try {
  const result = await streamText({ model, messages });
  return result.toTextStreamResponse();
} catch (error) {
  logger.error("AI SDK error:", error);
  return new Response("Internal server error", { status: 500 });
}
```

### 13. ✅ Model Configuration Consistency

- Always use `aiConfig.explainerModel` for construction estimation tasks
- Use `aiConfig.openaiApiKey` through the model provider, not directly
- Keep model selection logic centralized in `customModelProvider`

### 14. ✅ Tool Integration Patterns

- For MCP tools: Use `mcpClientsManager.tools()` and `mcpClientsManager.toolCall()`
- For workflow tools: Use `loadWorkFlowTools()` with proper context
- For app default tools: Use `loadAppDefaultTools()` with mentions

## Guardrails

- ❌ No renaming of exported functions, constants, or paths
- ❌ No new dependencies
- ✅ All imports should remain relative to `@/` aliases
- ✅ Each change must preserve runtime behavior exactly
- ✅ Add inline comments `// AI SDK model fix` where changes occur
- ✅ Leave console logging or telemetry untouched

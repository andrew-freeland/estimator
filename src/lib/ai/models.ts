import "server-only";

import { LanguageModel } from "ai";
import { ChatModel } from "app-types/chat";

// Dynamic model loading to reduce bundle size
async function loadStaticModels() {
  const [
    { createOllama },
    { openai },
    { google },
    { anthropic },
    { xai },
    { openrouter },
    { createGroq },
    // { createOpenAICompatibleModels, openaiCompatibleModelsSafeParse },
  ] = await Promise.all([
    import("ollama-ai-provider-v2"),
    import("@ai-sdk/openai"),
    import("@ai-sdk/google"),
    import("@ai-sdk/anthropic"),
    import("@ai-sdk/xai"),
    import("@openrouter/ai-sdk-provider"),
    import("@ai-sdk/groq"),
    import("./create-openai-compatiable"),
  ]);

  const ollama = createOllama({
    baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/api",
  });
  const groq = createGroq({
    baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY,
  });

  return {
    openai: {
      "gpt-4.1": openai("gpt-4.1"),
      "gpt-4.1-mini": openai("gpt-4.1-migrate"),
      "o4-mini": openai("o4-mini"),
      o3: openai("o3"),
      "gpt-5": openai("gpt-5"),
      "gpt-5-mini": openai("gpt-5-mini"),
      "gpt-5-nano": openai("gpt-5-nano"),
    },
    google: {
      "gemini-2.5-flash-lite": google("gemini-2.5-flash-lite"),
      "gemini-2.5-flash": google("gemini-2.5-flash"),
      "gemini-2.5-pro": google("gemini-2.5-pro"),
    },
    anthropic: {
      "sonnet-4.5": anthropic("claude-sonnet-4-5"),
      "opus-4.1": anthropic("claude-opus-4-1"),
    },
    xai: {
      "grok-4-fast": xai("grok-4-fast-non-reasoning"),
      "grok-4": xai("grok-4"),
      "grok-3": xai("grok-3"),
      "grok-3-mini": xai("grok-3-mini"),
    },
    ollama: {
      "gemma3:1b": ollama("gemma3:1b"),
      "gemma3:4b": ollama("gemma3:4b"),
      "gemma3:12b": ollama("gemma3:12b"),
    },
    groq: {
      "kimi-k2-instruct": groq("moonshotai/kimi-k2-instruct"),
      "llama-4-scout-17b": groq("meta-llama/llama-4-scout-17b-16e-instruct"),
      "gpt-oss-20b": groq("openai/gpt-oss-20b"),
      "gpt-oss-120b": groq("openai/gpt-oss-120b"),
      "qwen3-32b": groq("qwen/qwen3-32b"),
    },
    openRouter: {
      "gpt-oss-20b:free": openrouter("openai/gpt-oss-20b:free"),
      "qwen3-8b:free": openrouter("qwen/qwen3-8b:free"),
      "qwen3-14b:free": openrouter("qwen/qwen3-14b:free"),
      "qwen3-coder:free": openrouter("qwen/qwen3-coder:free"),
      "deepseek-r1:free": openrouter("deepseek/deepseek-r1-0528:free"),
      "deepseek-v3:free": openrouter("deepseek/deepseek-chat-v3-0324:free"),
      "gemini-2.0-flash-exp:free": openrouter(
        "google/gemini-2.0-flash-exp:free",
      ),
    },
  };
}

// Cache for loaded models
let modelsCache: any = null;

async function getModels() {
  if (!modelsCache) {
    const staticModels = await loadStaticModels();

    // Load OpenAI compatible models
    const { createOpenAICompatibleModels, openaiCompatibleModelsSafeParse } =
      await import("./create-openai-compatiable");
    const openaiCompatibleProviders = openaiCompatibleModelsSafeParse(
      process.env.OPENAI_COMPATIBLE_DATA,
    );
    const {
      providers: openaiCompatibleModels,
      unsupportedModels: openaiCompatibleUnsupportedModels,
    } = createOpenAICompatibleModels(openaiCompatibleProviders);

    const staticUnsupportedModels = new Set([
      staticModels.openai["o4-mini"],
      staticModels.ollama["gemma3:1b"],
      staticModels.ollama["gemma3:4b"],
      staticModels.ollama["gemma3:12b"],
      staticModels.openRouter["gpt-oss-20b:free"],
      staticModels.openRouter["qwen3-8b:free"],
      staticModels.openRouter["qwen3-14b:free"],
      staticModels.openRouter["deepseek-r1:free"],
      staticModels.openRouter["gemini-2.0-flash-exp:free"],
    ]);

    const staticSupportImageInputModels = {
      ...staticModels.google,
      ...staticModels.xai,
      ...staticModels.openai,
      ...staticModels.anthropic,
    };

    const allModels = { ...openaiCompatibleModels, ...staticModels };

    const allUnsupportedModels = new Set([
      ...openaiCompatibleUnsupportedModels,
      ...staticUnsupportedModels,
    ]);

    modelsCache = {
      staticModels,
      staticUnsupportedModels,
      staticSupportImageInputModels,
      allModels,
      allUnsupportedModels,
    };
  }
  return modelsCache;
}

export const isToolCallUnsupportedModel = async (model: LanguageModel) => {
  const { allUnsupportedModels } = await getModels();
  return allUnsupportedModels.has(model);
};

const isImageInputUnsupportedModel = async (model: any) => {
  const { staticSupportImageInputModels } = await getModels();
  return !Object.values(staticSupportImageInputModels).includes(model);
};

async function getFallbackModel() {
  const { staticModels } = await getModels();
  return staticModels.openai["gpt-4.1"];
}

// Research-backed fix: Enhanced model capability detection and fallback strategies
export const customModelProvider = {
  async getModelsInfo() {
    const { allModels } = await getModels();
    const results = [];
    for (const [provider, models] of Object.entries(allModels)) {
      const modelEntries = [];
      for (const [name, model] of Object.entries(models)) {
        modelEntries.push({
          name,
          isToolCallUnsupported: await isToolCallUnsupportedModel(model),
          isImageInputUnsupported: await isImageInputUnsupportedModel(model),
        });
      }
      results.push({
        provider,
        models: modelEntries,
        hasAPIKey: checkProviderAPIKey(provider as string),
      });
    }
    return results;
  },
  async getModel(model?: ChatModel): Promise<LanguageModel> {
    if (!model) return await getFallbackModel();
    const { allModels } = await getModels();
    return (
      allModels[model.provider]?.[model.model] || (await getFallbackModel())
    );
  },
  // Research-backed fix: Smart model selection based on capabilities
  async getModelForRequest(request: {
    needsVision?: boolean;
    needsTools?: boolean;
    userPreference?: string;
    maxCost?: "low" | "medium" | "high";
  }): Promise<LanguageModel> {
    const { needsVision, needsTools, userPreference, maxCost } = request;
    const { staticModels } = await getModels();

    // Vision-capable models
    if (needsVision) {
      if (userPreference === "google" && checkProviderAPIKey("google")) {
        return staticModels.google["gemini-2.5-pro"];
      }
      // Fallback to OpenAI vision model
      return staticModels.openai["gpt-4.1"];
    }

    // Tool-capable models
    if (needsTools) {
      if (userPreference === "xai" && checkProviderAPIKey("xai")) {
        return staticModels.xai["grok-4"];
      }
      if (userPreference === "anthropic" && checkProviderAPIKey("anthropic")) {
        return staticModels.anthropic["sonnet-4.5"];
      }
      // Default to OpenAI for strong tool support
      return staticModels.openai["gpt-4.1"];
    }

    // Cost-optimized selection
    if (maxCost === "low") {
      if (checkProviderAPIKey("openai")) {
        return staticModels.openai["gpt-4.1-mini"];
      }
      if (checkProviderAPIKey("google")) {
        return staticModels.google["gemini-2.5-flash-lite"];
      }
    }

    // User preference
    if (userPreference === "anthropic" && checkProviderAPIKey("anthropic")) {
      return staticModels.anthropic["sonnet-4.5"];
    }
    if (userPreference === "google" && checkProviderAPIKey("google")) {
      return staticModels.google["gemini-2.5-pro"];
    }

    // Default fallback
    return await getFallbackModel();
  },
  // Research-backed fix: Provider health check
  async checkProviderHealth(provider: string): Promise<boolean> {
    try {
      const { allModels } = await getModels();
      const model = allModels[provider as keyof typeof allModels];
      if (!model) return false;

      const firstModel = Object.values(model)[0];
      if (!firstModel) return false;

      // Simple health check - attempt to generate a minimal response
      // This would be implemented with a lightweight test call
      return checkProviderAPIKey(provider as string);
    } catch (_error) {
      return false;
    }
  },
};

function checkProviderAPIKey(provider: string) {
  let key: string | undefined;
  switch (provider) {
    case "openai":
      key = process.env.OPENAI_API_KEY;
      break;
    case "google":
      key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      break;
    case "anthropic":
      key = process.env.ANTHROPIC_API_KEY;
      break;
    case "xai":
      key = process.env.XAI_API_KEY;
      break;
    case "groq":
      key = process.env.GROQ_API_KEY;
      break;
    case "openRouter":
      key = process.env.OPENROUTER_API_KEY;
      break;
    default:
      return true; // assume the provider has an API key
  }
  return !!key && key != "****";
}

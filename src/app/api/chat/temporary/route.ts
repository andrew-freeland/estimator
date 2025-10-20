import { getSession } from "auth/server";
import {
  UIMessage,
  convertToModelMessages,
  smoothStream,
  streamText,
} from "ai";
import { customModelProvider } from "lib/ai/models";
import globalLogger from "logger";
import { buildUserSystemPrompt } from "lib/ai/prompts";
import { getUserPreferences } from "lib/user/server";

import { colorize } from "consola/utils";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Temporary Chat API: `),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();

    const session = await getSession();

    const { messages, chatModel, instructions } = json as {
      messages: UIMessage[];
      chatModel?: {
        provider: string;
        model: string;
      };
      instructions?: string;
    };
    logger.info(`model: ${chatModel?.provider}/${chatModel?.model}`);
    const model = customModelProvider.getModel(chatModel);

    // For non-authenticated users, use a default system prompt
    let systemPrompt =
      "You are Estimator Assistant, an AI-powered estimating companion for builders. Help users with construction estimates, project scoping, and cost analysis.";

    if (session?.user) {
      const userPreferences =
        (await getUserPreferences(session.user.id)) || undefined;
      systemPrompt = `${buildUserSystemPrompt(session.user, userPreferences)} ${
        instructions ? `\n\n${instructions}` : ""
      }`.trim();
    } else if (instructions) {
      systemPrompt = `${systemPrompt}\n\n${instructions}`;
    }

    return streamText({
      model,
      system: systemPrompt,
      messages: convertToModelMessages(messages),
      experimental_transform: smoothStream({ chunking: "word" }),
      // AI SDK model fix
    }).toTextStreamResponse();
  } catch (error: any) {
    logger.error(error);
    return new Response(error.message || "Oops, an error occured!", {
      status: 500,
    });
  }
}

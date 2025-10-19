import { customModelProvider } from "lib/ai/models";

export const GET = async () => {
  try {
    const modelsInfo = await customModelProvider.getModelsInfo();
    return Response.json(
      modelsInfo.sort((a, b) => {
        if (a.hasAPIKey && !b.hasAPIKey) return -1;
        if (!a.hasAPIKey && b.hasAPIKey) return 1;
        return 0;
      }),
    );
  } catch (error) {
    console.error("Error fetching models info:", error);
    return Response.json([], { status: 500 });
  }
};

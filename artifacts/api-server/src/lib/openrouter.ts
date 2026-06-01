import OpenAI from "openai";

export const SONAR_SEARCH_MODEL = "perplexity/sonar-pro-search";

let client: OpenAI | null = null;

/**
 * Returns an OpenRouter-backed OpenAI client, or null if the key is not
 * configured. Lazily constructed so a missing key never crashes the server at
 * boot — only the off-script Sonar search path is affected.
 */
export function getOpenRouter(): OpenAI | null {
  if (!process.env.OPENROUTER_API_KEY) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }
  return client;
}

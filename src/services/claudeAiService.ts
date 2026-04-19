import { Anthropic } from "@anthropic-ai/sdk";
import { env } from "../config/env";

interface LocationInfo {
  displayName?: string;
  city?: string;
  country?: string;
  wikiTitle?: string;
  wikiExtract?: string;
}

interface SummaryInput {
  userNote: string | null | undefined;
  locationInfo: LocationInfo | null | undefined;
  originalFilename: string;
  imageAnalysis?: string | null;
}

let claudeClient: Anthropic | null = null;

function getClaudeClient(): Anthropic {
  if (!claudeClient) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable not set");
    }
    claudeClient = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY
    });
  }
  return claudeClient;
}

export const DEFAULT_CAPTION_PROMPT = `You are a concise travel captions generator. Based on the following information about a photo and location, generate a brief, engaging human-readable summary in 1-2 sentences. The summary will be used as a video caption and should be interesting and capture the essence of the moment or location.

Information provided:
{{context}}

Requirements:
- Write in 1-2 sentences maximum
- Be engaging and emotional if possible, not just factual
- Focus on the location and moment captured
- If Traveller notes are provided, incorporate relevant details
- Write in first or second person perspective as if describing the moment. Use "my" or "our" if it fits the context.

Generate the captions now:`;

export async function generateImageSummary(input: SummaryInput, promptTemplate?: string): Promise<string> {
  const client = getClaudeClient();

  // Build context string from available information
  const contextParts: string[] = [];

  if (input.originalFilename) {
    contextParts.push(`Photo filename: ${input.originalFilename}`);
  }

  if (input.locationInfo) {
    if (input.locationInfo.displayName) {
      contextParts.push(`Location name: ${input.locationInfo.displayName}`);
    }
    if (input.locationInfo.city) {
      contextParts.push(`City: ${input.locationInfo.city}`);
    }
    if (input.locationInfo.country) {
      contextParts.push(`Country: ${input.locationInfo.country}`);
    }
    if (input.locationInfo.wikiTitle) {
      contextParts.push(`Nearby landmark: ${input.locationInfo.wikiTitle}`);
    }
    if (input.locationInfo.wikiExtract) {
      contextParts.push(`About the location: ${input.locationInfo.wikiExtract}`);
    }
  }

  if (input.userNote) {
    contextParts.push(`Traveller note: ${input.userNote}`);
  }

  if (input.imageAnalysis) {
    contextParts.push(`Image analysis: ${input.imageAnalysis}`);
  }

  const contextString = contextParts.join("\n");
  const template = promptTemplate ?? DEFAULT_CAPTION_PROMPT;
  const prompt = template.replace("{{context}}", contextString);

  const message = await client.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ]
  });

  // Extract text content from response
  const textContent = message.content.find((block) => block.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text content in Claude response");
  }

  // Clean up response (remove extra whitespace, trim)
  const summary = textContent.text.trim();

  // Enforce max 3 sentences by taking first 3 sentences
  const sentences = summary.match(/[^.!?]+[.!?]/g) || [summary];
  const limitedSummary = sentences.slice(0, 3).join("").trim();

  return limitedSummary;
}

export type TranslationLanguage = "german" | "spanish" | "bulgarian";

const LANGUAGE_NAMES: Record<TranslationLanguage, string> = {
  german: "German",
  spanish: "Spanish",
  bulgarian: "Bulgarian"
};

export async function translateText(text: string, language: TranslationLanguage): Promise<string> {
  const client = getClaudeClient();

  const targetLanguage = LANGUAGE_NAMES[language];

  const prompt = `Translate the following text to ${targetLanguage}. Return only the translated text, without any explanation or additional comments.

Text to translate:
${text}`;

  const message = await client.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }]
  });

  const textContent = message.content.find((block) => block.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text content in Claude response");
  }

  return textContent.text.trim();
}

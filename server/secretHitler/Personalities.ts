// AI player personalities for Secret Hitler, ported from secreth's masterAiService.
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../logger.js";

export interface AIPersonality {
  id: string; // seat id: ai_0 ... ai_8
  name: string;
  voice: string; // OpenAI TTS voice, used when narration is enabled
  traits: string;
  chatStyle: string;
  bluffTendency: "low" | "medium" | "high";
}

const VOICES = ["alloy", "echo", "fable", "nova", "shimmer"];

export const FALLBACK_PERSONALITIES: Omit<AIPersonality, "id" | "voice">[] = [
  { name: "Ernst", traits: "paranoid, meticulous, suspicious of everyone", chatStyle: "speaks in clipped sentences with frequent accusations", bluffTendency: "high" },
  { name: "Liesel", traits: "charming, manipulative, silver-tongued", chatStyle: "speaks smoothly and reassuringly", bluffTendency: "high" },
  { name: "Viktor", traits: "blunt, aggressive, easily angered", chatStyle: "short sharp statements, rarely elaborate", bluffTendency: "medium" },
  { name: "Marta", traits: "cautious, analytical, quietly observant", chatStyle: "measured, thoughtful, asks probing questions", bluffTendency: "low" },
  { name: "Heinrich", traits: "verbose, philosophical, loves to lecture", chatStyle: "long rambling speeches with historical references", bluffTendency: "medium" },
  { name: "Ingrid", traits: "nervous, indecisive, easily swayed", chatStyle: "hedges every statement, frequently changes mind", bluffTendency: "low" },
  { name: "Klaus", traits: "arrogant, self-important, always certain", chatStyle: "confident pronouncements, dismisses opposition", bluffTendency: "high" },
  { name: "Rosa", traits: "empathetic, community-minded, idealistic", chatStyle: "appeals to shared values and unity", bluffTendency: "low" },
  { name: "Otto", traits: "cunning, tactical, speaks in double-meanings", chatStyle: "cryptic suggestions and veiled implications", bluffTendency: "high" },
];

function fallbacks(count: number, takenNames: string[]): AIPersonality[] {
  const taken = new Set(takenNames.map((n) => n.toLowerCase()));
  return FALLBACK_PERSONALITIES
    .filter((p) => !taken.has(p.name.toLowerCase()))
    .slice(0, count)
    .map((p, i) => ({ ...p, id: `ai_${i}`, voice: VOICES[i % VOICES.length] }));
}

/**
 * Generate `count` distinct AI personalities via Claude, deduped against human
 * player names. Falls back to the hardcoded set after `timeoutMs` or any error.
 */
export async function generateAIPersonalities(count: number, takenNames: string[], timeoutMs = 15000): Promise<AIPersonality[]> {
  if (count <= 0) return [];
  if (!process.env.ANTHROPIC_API_KEY) return fallbacks(count, takenNames);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await Promise.race([
      client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Generate ${count} distinct player personalities for a Secret Hitler board game.
Return a JSON array with exactly ${count} objects. Each object must have:
- "name": string (max 12 chars, 1930s German-era first name, no surnames). Do NOT use these names: ${takenNames.join(", ") || "none"}
- "traits": string (3-4 personality traits separated by commas)
- "chatStyle": string (one sentence describing how they speak)
- "bluffTendency": one of "low", "medium", "high"

Ensure personalities are diverse and distinct from each other. Return ONLY valid JSON, no markdown or explanation.`,
          },
        ],
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("personality generation timed out")), timeoutMs)),
    ]);

    const content = response.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    const stripped = content.text.replace(/```(?:json)?\n?/g, "").replace(/\n?```/g, "");
    const parsed = JSON.parse(stripped) as Array<{
      name: string;
      traits: string;
      chatStyle: string;
      bluffTendency: "low" | "medium" | "high";
    }>;

    const taken = new Set(takenNames.map((n) => n.toLowerCase()));
    const result: AIPersonality[] = [];
    for (const p of parsed) {
      if (result.length >= count) break;
      const name = p.name.slice(0, 12);
      if (taken.has(name.toLowerCase())) continue;
      taken.add(name.toLowerCase());
      result.push({
        id: `ai_${result.length}`,
        name,
        voice: VOICES[result.length % VOICES.length],
        traits: p.traits,
        chatStyle: p.chatStyle,
        bluffTendency: p.bluffTendency,
      });
    }
    if (result.length < count) {
      const extra = fallbacks(count, [...taken]).slice(0, count - result.length);
      result.push(...extra.map((p, i) => ({ ...p, id: `ai_${result.length + i}` })));
    }
    return result;
  } catch (err) {
    logger.warn(`SH personality generation failed, using fallbacks: ${err instanceof Error ? err.message : err}`);
    return fallbacks(count, takenNames);
  }
}

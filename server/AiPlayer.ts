import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export async function generateDescriptor(
  secretWord: string,
  category: string,
  previousDescriptors: string[]
): Promise<string> {
  const prevList =
    previousDescriptors.length > 0
      ? `\nThese words have already been said: ${previousDescriptors.join(", ")}`
      : "";

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 50,
    messages: [
      {
        role: "user",
        content: `You are playing a word guessing game. The secret word is "${secretWord}" (category: ${category}).

You need to give a ONE-WORD descriptor that:
- Shows you know the word (relates to it)
- Is not too obvious (don't make it easy for the impostor to guess)
- Is a single word, no spaces, no punctuation
- Is NOT the secret word itself
- Is creative and slightly unexpected — pick an association that's valid but not the first thing everyone would think of
${prevList}
Do NOT repeat any previous word.

Reply with ONLY the single word, nothing else.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  const word = text.split(/\s/)[0].replace(/[^a-zA-Z0-9'-]/g, "");
  return word || "related";
}

export async function generateDirectives(
  location: string,
  role: string
): Promise<string[]> {
  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You are playing Spyfall. The location is "${location}" and your role is "${role}".

Generate exactly 3 conversation directives that this player MUST follow during the discussion round. These should be:
- Specific enough to be challenging to work into conversation naturally
- Related to the location/role but in a way that might seem suspicious to others
- Fun and creative — force the player to say things they wouldn't normally say
- Short — each directive is one sentence

Examples of good directives:
- "Casually mention that you've been feeling seasick lately"
- "Ask someone what the dress code is here"
- "Complain about the temperature being wrong for this place"
- "Refer to a coworker named Gerald who doesn't exist"

Return ONLY a JSON array of 3 strings, no other text. Example: ["directive 1", "directive 2", "directive 3"]`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    const directives: string[] = JSON.parse(jsonMatch[0]);
    return directives.slice(0, 3);
  }

  return [
    "Mention something about the weather outside",
    "Ask someone if they come here often",
    "Complain about something being too expensive",
  ];
}

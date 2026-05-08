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

export async function generateOddOneOutPrompts(): Promise<{
  normalPrompt: string;
  oddPrompt: string;
}> {
  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Generate a pair of prompts for a social deduction party game called "Odd One Out".

Most players get the NORMAL prompt. One player gets the ODD prompt. The key:
- Both prompts should LOOK like they could be the same question at a glance
- But the answers should be NOTICEABLY DIFFERENT if you compare them — the odd player's answer should stick out
- The difference should flip the meaning: best→worst, love→hate, proud→ashamed, would→would never, etc.
- SPICY, edgy, funny — adult party game (PG-13/R, no sexual content)
- Questions people can answer in a short phrase (5-15 words)

The trick is: the questions look similar in structure but produce OPPOSITE or CLEARLY DIFFERENT answers. The odd player has to fake an answer that fits with the others.

GOOD examples (answers would clearly differ):
- Normal: "What's the best thing about your job?" / Odd: "What's the worst thing about your job?"
- Normal: "Name a celebrity you'd love to have dinner with" / Odd: "Name a celebrity you'd dread having dinner with"
- Normal: "What's something you're secretly proud of?" / Odd: "What's something you're secretly ashamed of?"
- Normal: "What would you do with a million dollars?" / Odd: "What would you do if you lost everything tomorrow?"
- Normal: "What's a hill you'd die on?" / Odd: "What's an opinion you've completely changed your mind on?"

BAD examples (too similar, answers would overlap):
- "Best pizza topping" vs "Favorite pizza topping" — same thing!
- "Worst habit" vs "Bad habit" — too close!

Return ONLY valid JSON: { "normalPrompt": "...", "oddPrompt": "..." }`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  return {
    normalPrompt: "What's the best pizza topping?",
    oddPrompt: "What's the worst pizza topping?",
  };
}

export async function generateHotTake(): Promise<{
  question: string;
  optionA: string;
  optionB: string;
}> {
  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Generate a spicy, debatable opinion question with exactly two options for an adult party game.

The question should:
- Be a "would you rather", hot take, or controversial preference question
- Have two clearly different but both defensible options
- Be SPICY — edgy, provocative, funny, or make people uncomfortable defending their answer
- PG-13 to R rated, but avoid explicitly sexual content
- The kind of question that starts arguments at parties and reveals who your friends really are

Examples:
- "Would you rather know exactly when you'll die or exactly how you'll die?" → "When" / "How"
- "Is it worse to cheat on your partner or to snitch on your best friend to the cops?" → "Cheating" / "Snitching"
- "Would you rather have everyone read your search history or your DMs?" → "Search history" / "DMs"
- "Would you rather fight your dad or fight your boss?" → "Dad" / "Boss"
- "Is it OK to ghost someone after 3 dates?" → "Totally fine" / "Absolutely not"

Return ONLY valid JSON: { "question": "...", "optionA": "...", "optionB": "..." }`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  return {
    question: "Would you rather have the ability to fly or be invisible?",
    optionA: "Fly",
    optionB: "Invisible",
  };
}

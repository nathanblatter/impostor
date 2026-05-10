import Anthropic from "@anthropic-ai/sdk";
import { saveAsset, getRecentAssets } from "./db.js";

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
  const recent = await getRecentAssets("ODD_ONE_OUT", 5);
  const avoidList = recent.length > 0
    ? `\n\nDo NOT reuse any of these recent prompt pairs:\n${recent.map((r: any) => `- "${r.normalPrompt}" / "${r.oddPrompt}"`).join("\n")}`
    : "";

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

Return ONLY valid JSON: { "normalPrompt": "...", "oddPrompt": "..." }${avoidList}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const result = JSON.parse(jsonMatch[0]);
    saveAsset("ODD_ONE_OUT", result);
    return result;
  }

  return {
    normalPrompt: "What's the best pizza topping?",
    oddPrompt: "What's the worst pizza topping?",
  };
}

export async function generateOddOneOutAnswer(
  prompt: string
): Promise<string> {
  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 60,
    messages: [
      {
        role: "user",
        content: `You are playing a party game. You were asked: "${prompt}"

Give a short, natural-sounding answer (5-15 words). It should:
- Sound like a real person's honest answer
- Be specific and personal-sounding, not generic
- Be a little funny or unexpected — the kind of answer that gets a laugh
- Be something a real person might actually say at a party

Reply with ONLY the answer, nothing else.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";
  return text || "I honestly can't think of one";
}

export async function generateHotTakeArguments(
  question: string,
  chosenOption: string
): Promise<string[]> {
  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You're playing a party game. The question was: "${question}"
You must argue for: "${chosenOption}"

Generate exactly 3 specific talking points you MUST use to defend this choice during discussion. They should be:
- Convincing but slightly unusual — the kind of argument that makes people go "hmm, interesting"
- Personal-sounding, like you really believe this
- Short — one sentence each
- A mix: one logical argument, one emotional/personal, one funny/unexpected

Return ONLY a JSON array of 3 strings, no other text. Example: ["point 1", "point 2", "point 3"]`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]).slice(0, 3);
  }

  return [
    "I've thought about this a lot and it's clearly the right choice",
    "Anyone who picks the other option hasn't really considered the consequences",
    "My therapist would agree with me on this one",
  ];
}

export async function generateHotTake(): Promise<{
  question: string;
  fakerQuestion: string;
  optionA: string;
  optionB: string;
}> {
  const recent = await getRecentAssets("HOT_TAKE", 5);
  const avoidList = recent.length > 0
    ? `\n\nDo NOT reuse any of these recent questions:\n${recent.map((r: any) => `- Q: "${r.question}" / Faker: "${r.fakerQuestion}" (${r.optionA} / ${r.optionB})`).join("\n")}`
    : "";

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Generate a pair of opinion questions for a social deduction party game. Both questions must use the EXACT SAME two answer options, but be DIFFERENT questions.

Most players see the real question. One player (the "faker") sees a different question with the same options. During discussion, the faker's reasoning won't match because they answered a different question — other players try to figure out who's off.

Requirements:
- Both questions must genuinely work with the same two options
- Questions should be different enough that reasoning diverges, but not SO different the options feel forced
- SPICY, edgy, provocative — adult party game (PG-13/R, no sexual content)
- Options should be short (1-4 words each)

GOOD examples:
- Question: "Would you rather lose all your money or all your friends?" / Faker: "Would you rather lose your memory or your reputation?" → "Money/Memory" / "Friends/Reputation" — wait, options must be IDENTICAL. Let me fix:
- Question: "Would you rather be famous or be rich?" / Faker: "Would you rather be feared or be loved?" → "Option A" / "Option B" where A=Famous/Feared, B=Rich/Loved — NO, options must literally be the same words.

ACTUALLY GOOD examples (same literal options, different questions):
- Q: "Which is more important in a partner?" / Faker Q: "Which is more important in a boss?" → "Honesty" / "Loyalty"
- Q: "Which would you give up forever?" / Faker Q: "Which would you want unlimited amounts of?" → "Money" / "Free time"
- Q: "Which is a bigger red flag on a first date?" / Faker Q: "Which is a bigger red flag in a roommate?" → "Being late" / "Being cheap"
- Q: "Which is harder to forgive?" / Faker Q: "Which is easier to get away with?" → "Lying" / "Cheating"

Return ONLY valid JSON: { "question": "...", "fakerQuestion": "...", "optionA": "...", "optionB": "..." }${avoidList}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const result = JSON.parse(jsonMatch[0]);
    saveAsset("HOT_TAKE", result);
    return result;
  }

  return {
    question: "Which is more important in a partner?",
    fakerQuestion: "Which is more important in a boss?",
    optionA: "Honesty",
    optionB: "Loyalty",
  };
}

export async function generateFingerPointPrompts(
  previousPrompts: string[] = []
): Promise<{
  normalPrompt: string;
  fakerPrompt: string;
}> {
  const topics = [
    "survival skills", "embarrassing habits", "secret talents", "food opinions",
    "childhood memories", "workplace behavior", "relationship style", "criminal potential",
    "celebrity comparisons", "superpower choices", "travel disasters", "party behavior",
    "social media habits", "morning routines", "road rage", "shopping habits",
    "karaoke choices", "pet peeves", "guilty pleasures", "dating dealbreakers",
  ];
  const topic = topics[Math.floor(Math.random() * topics.length)];

  const dbRecent = await getRecentAssets("FINGER_POINT", 5);
  const dbPrompts = dbRecent.map((r: any) => r.normalPrompt);
  const allPrevious = [...new Set([...previousPrompts, ...dbPrompts])];
  const avoidList = allPrevious.length > 0
    ? `\n\nDo NOT use any of these previous prompts (generate something completely new):\n${allPrevious.map(p => `- "${p}"`).join("\n")}`
    : "";

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Generate a pair of "point at someone" prompts for a party game. Theme this round around: ${topic}.

Most players get the NORMAL prompt. One player (the faker) gets a DIFFERENT prompt. Everyone must point at another player based on their prompt. The faker has to justify their pick even though they answered a different question.

Requirements:
- Both prompts should be "Who is most likely to..." or "Point at the person who..." style
- The faker's prompt should be RELATED but clearly different — similar enough the faker could bluff, different enough their pick might seem weird
- Fun, edgy, personal, provocative — adult party game
- Short — one sentence each
- Be CREATIVE and UNIQUE — don't repeat common prompts${avoidList}

Return ONLY valid JSON: { "normalPrompt": "...", "fakerPrompt": "..." }`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const result = JSON.parse(jsonMatch[0]);
    saveAsset("FINGER_POINT", result);
    return result;
  }

  return {
    normalPrompt: "Point at who would survive longest in a horror movie",
    fakerPrompt: "Point at who would be the killer in a horror movie",
  };
}

export async function generateTouchyQuestion(
  previousQuestions: string[] = []
): Promise<string> {
  const recent = await getRecentAssets("TOUCHY_SUBJECTS", 5);
  const dbQuestions = recent.map((r: any) => r.question);
  const allPrevious = [...new Set([...previousQuestions, ...dbQuestions])];

  const avoidList = allPrevious.length > 0
    ? `\n\nDo NOT reuse any of these previous questions:\n${allPrevious.map(q => `- "${q}"`).join("\n")}`
    : "";

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `Generate ONE spicy "touchy subjects" question for a party game where players vote on who in their group fits the description best.

The question should be:
- "Who is most likely to..." or "Who in the group..." style
- Personal, edgy, funny, or provocative — the kind of question that creates drama
- Something that could apply to anyone (not gender/appearance specific)
- PG-13/R rated, no sexual content
- Short — one sentence

Examples:
- "Who is most likely to sell out their friends for money?"
- "Who talks the biggest game but can't back it up?"
- "Who would be the first to crack under interrogation?"
- "Who has the worst taste in music but won't admit it?"
- "Who is secretly the most competitive person here?"
- "Who would survive the longest in a zombie apocalypse?"
- "Who is the biggest control freak?"
- "Who would be the worst person to be stuck on a deserted island with?"${avoidList}

Reply with ONLY the question, nothing else.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  const question = text.replace(/^["']|["']$/g, "") || "Who is the most likely to start drama?";
  saveAsset("TOUCHY_SUBJECTS", { question });
  return question;
}

export async function generateTriggerAssignments(
  playerNames: string[],
  guesserName: string
): Promise<{ targetName: string; trigger: string; action: string }[]> {
  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: `You are creating assignments for a party game called TRIGGER. ${guesserName} is the "guesser". The other players each have a secret rule: when ${guesserName} does a specific trigger action, they must perform their assigned response.

Players to assign triggers to: ${playerNames.join(", ")}

For each player, create a UNIQUE trigger+action pair:
- TRIGGER: something ${guesserName} might naturally do during conversation (e.g., "says the word 'like'", "touches their face", "picks up their phone", "crosses their arms", "laughs", "stands up")
- ACTION: a funny/subtle physical response (e.g., "clap once", "say 'interesting'", "snap their fingers", "clear their throat", "tap the table", "nod three times")
- Each player must have a DIFFERENT trigger and a DIFFERENT action
- Triggers should be observable and natural things that happen in conversation
- Actions should be subtle but noticeable if you're watching for them

Return ONLY a valid JSON array, no other text:
[{"targetName": "...", "trigger": "...", "action": "..."}, ...]`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  throw new Error("Failed to parse trigger assignments");
}

export async function generateTriggerSuggestion(
  targetName: string,
  guesserName: string
): Promise<{ trigger: string; action: string }> {
  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 150,
    messages: [
      {
        role: "user",
        content: `Party game TRIGGER: ${guesserName} is the guesser. Create a secret rule for ${targetName}.

- TRIGGER: something ${guesserName} might naturally do (e.g., "says the word 'like'", "checks their phone", "laughs", "runs their hand through their hair")
- ACTION: ${targetName}'s funny/subtle response (e.g., "snap fingers", "say 'noted'", "pat their head", "clap once")

Return ONLY valid JSON: {"trigger": "...", "action": "..."}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  return { trigger: "laughs out loud", action: "clap once" };
}

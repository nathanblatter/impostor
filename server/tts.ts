const TTS_URL = "https://api.openai.com/v1/audio/speech";

export async function generateSpeech(text: string, voice: string = "onyx"): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY not set, skipping TTS");
    return null;
  }

  try {
    const response = await fetch(TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      console.error("TTS API error:", response.status, await response.text());
      return null;
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  } catch (err) {
    console.error("TTS generation failed:", err);
    return null;
  }
}

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const DELIMITER = " ||| ";

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_API_KEY is not configured" },
      { status: 500 }
    );
  }

  try {
    const { chunks } = await request.json();
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return NextResponse.json(
        { error: "chunks array is required" },
        { status: 400 }
      );
    }

    const concatenated = chunks.join(DELIMITER);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `You are a punctuation restoration tool for English speech transcripts.

The following text is from an auto-generated YouTube subtitle. It lacks punctuation and proper capitalization.

The text contains segments separated by "${DELIMITER.trim()}". You MUST preserve every "${DELIMITER.trim()}" delimiter exactly as-is. Do NOT add, remove, or move any delimiter.

Your task:
1. Add proper punctuation (periods, commas, question marks, exclamation marks, apostrophes, colons)
2. Capitalize the first letter of each sentence
3. Capitalize proper nouns (names, brands, places — e.g. "apple" → "Apple", "ipod" → "iPod", "macintosh" → "Macintosh")
4. Remove filler artifacts like "[Applause]", "[Music]", "[Laughter]" — replace with empty string
5. Do NOT change any words, do NOT rephrase, do NOT add words, do NOT remove spoken words

Return ONLY the corrected text with delimiters preserved. No explanations, no markdown.

Text:
${concatenated}`;

    const result = await model.generateContent(prompt);
    const punctuated = result.response.text().trim();
    const punctuatedChunks = punctuated.split(DELIMITER);

    if (punctuatedChunks.length !== chunks.length) {
      console.warn(
        `Punctuation chunk mismatch: expected ${chunks.length}, got ${punctuatedChunks.length}. Returning original.`
      );
      return NextResponse.json({ chunks: chunks });
    }

    return NextResponse.json({
      chunks: punctuatedChunks.map((c: string) => c.trim()),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Punctuation error:", message);
    return NextResponse.json(
      { error: `整形に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}

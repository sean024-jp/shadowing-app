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
    const { enChunks, jaText } = await request.json();
    if (!Array.isArray(enChunks) || enChunks.length === 0 || !jaText) {
      return NextResponse.json(
        { error: "enChunks array and jaText are required" },
        { status: 400 }
      );
    }

    const concatenated = enChunks.join(DELIMITER);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `You are a Japanese translation alignment tool for English speech transcripts.

You are given:
1. English transcript segments separated by "${DELIMITER.trim()}" delimiters
2. A reference Japanese translation of the same speech

Your task: Produce a Japanese translation for EACH English segment, using "${DELIMITER.trim()}" as delimiter between segments.

Rules:
- Output MUST have exactly the same number of "${DELIMITER.trim()}" delimiters as the input (${enChunks.length - 1} delimiters for ${enChunks.length} segments)
- Use the reference Japanese translation as a guide for terminology and meaning
- Each Japanese segment should be a natural translation of its corresponding English segment
- Even if an English segment is a short fragment (e.g., "a half years."), produce a natural Japanese fragment for it
- Remove artifacts like [拍手], [音楽], [笑い], [Applause], [Music] — replace with empty string
- Do NOT add, remove, or reposition any "${DELIMITER.trim()}" delimiter
- Return ONLY the Japanese text with delimiters. No explanations, no markdown.

English segments:
${concatenated}

Reference Japanese:
${jaText}`;

    const result = await model.generateContent(prompt);
    const aligned = result.response.text().trim();
    const alignedChunks = aligned.split(DELIMITER);

    if (alignedChunks.length !== enChunks.length) {
      console.warn(
        `Alignment chunk mismatch: expected ${enChunks.length}, got ${alignedChunks.length}. Returning null.`
      );
      return NextResponse.json({ chunks: null });
    }

    return NextResponse.json({
      chunks: alignedChunks.map((c: string) => c.trim()),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Alignment error:", message);
    return NextResponse.json(
      { error: `整列に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}

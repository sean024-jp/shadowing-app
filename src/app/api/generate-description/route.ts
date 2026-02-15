import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_API_KEY is not configured" },
      { status: 500 }
    );
  }

  try {
    const { transcript } = await request.json();
    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json(
        { error: "transcript is required" },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent(
      `以下の英語スクリプトの内容を、英語学習者向けに140文字以内の日本語で要約してください。要約のみを出力し、余計な前置きや説明は不要です。\n\n${transcript}`
    );

    const description = result.response.text().trim();

    return NextResponse.json({ description });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Description generation error:", message);
    return NextResponse.json(
      { error: `概要の生成に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}

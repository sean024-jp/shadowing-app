import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json({ error: "videoId is required" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch video info");
    }

    const data = await response.json();
    return NextResponse.json({ title: data.title });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch video title" },
      { status: 500 }
    );
  }
}

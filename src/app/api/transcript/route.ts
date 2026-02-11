import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

type TranscriptItem = {
  text: string;
  offset: number;
  duration: number;
};

type Json3Event = {
  tStartMs: number;
  dDurationMs: number;
  segs?: Array<{ utf8: string; tOffsetMs?: number }>;
};

export const dynamic = "force-dynamic";

// Cloud Run API URL (set in production)
const TRANSCRIPT_API_URL = process.env.TRANSCRIPT_API_URL;

async function fetchTranscriptFromCloudRun(
  videoId: string,
  lang: string = "en"
): Promise<TranscriptItem[]> {
  if (!TRANSCRIPT_API_URL) {
    throw new Error("TRANSCRIPT_API_URL is not configured");
  }

  const url = `${TRANSCRIPT_API_URL}/transcript?videoId=${videoId}&lang=${lang}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

async function fetchTranscriptWithYtDlp(
  videoId: string,
  lang: string = "en"
): Promise<TranscriptItem[]> {
  const tmpDir = os.tmpdir();
  const fileId = randomUUID();
  const outputPath = path.join(tmpDir, `transcript_${fileId}`);

  try {
    const cmd = `yt-dlp --write-auto-sub --sub-lang ${lang} --sub-format json3 --skip-download -o "${outputPath}" "https://www.youtube.com/watch?v=${videoId}"`;

    await execAsync(cmd, { timeout: 30000 });

    const subtitlePath = `${outputPath}.${lang}.json3`;
    const content = await readFile(subtitlePath, "utf-8");
    const json = JSON.parse(content);

    const items: TranscriptItem[] = [];
    const events: Json3Event[] = json.events || [];

    for (const event of events) {
      if (!event.segs || event.segs.length === 0) continue;

      const text = event.segs
        .map((seg) => seg.utf8 || "")
        .join("")
        .replace(/\n/g, " ")
        .trim();

      if (text) {
        items.push({
          text,
          offset: event.tStartMs,
          duration: event.dDurationMs,
        });
      }
    }

    try {
      await unlink(subtitlePath);
    } catch {
      // Ignore cleanup errors
    }

    return items;
  } catch (error) {
    try {
      const subtitlePath = `${outputPath}.${lang}.json3`;
      await unlink(subtitlePath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");
  const lang = searchParams.get("lang") || "en";

  if (!videoId) {
    return NextResponse.json({ error: "videoId is required" }, { status: 400 });
  }

  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Invalid videoId format" }, { status: 400 });
  }

  try {
    let transcript: TranscriptItem[];

    // Use Cloud Run in production, local yt-dlp in development
    if (TRANSCRIPT_API_URL) {
      transcript = await fetchTranscriptFromCloudRun(videoId, lang);
    } else {
      transcript = await fetchTranscriptWithYtDlp(videoId, lang);
    }

    return NextResponse.json(transcript);
  } catch (error) {
    console.error("Transcript fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch transcript" },
      { status: 500 }
    );
  }
}

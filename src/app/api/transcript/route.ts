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

function parseJson3(content: string): TranscriptItem[] {
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

  return items;
}

async function fetchTranscriptWithYtDlp(
  videoId: string,
  langs: string[] = ["en"]
): Promise<Record<string, TranscriptItem[]>> {
  const tmpDir = os.tmpdir();
  const fileId = randomUUID();
  const outputPath = path.join(tmpDir, `transcript_${fileId}`);
  const langStr = langs.join(",");

  const result: Record<string, TranscriptItem[]> = {};

  try {
    const cmd = `yt-dlp --write-auto-sub --sub-lang ${langStr} --sub-format json3 --skip-download -o "${outputPath}" "https://www.youtube.com/watch?v=${videoId}"`;

    await execAsync(cmd, { timeout: 30000 });

    for (const lang of langs) {
      const subtitlePath = `${outputPath}.${lang}.json3`;
      try {
        const content = await readFile(subtitlePath, "utf-8");
        result[lang] = parseJson3(content);
      } catch {
        // Language not available
      } finally {
        try { await unlink(subtitlePath); } catch { /* ignore */ }
      }
    }

    return result;
  } catch (error) {
    // Clean up any files
    for (const lang of langs) {
      try { await unlink(`${outputPath}.${lang}.json3`); } catch { /* ignore */ }
    }
    throw error;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");
  const lang = searchParams.get("lang") || "en";
  const multiLang = searchParams.get("multiLang") === "true";

  if (!videoId) {
    return NextResponse.json({ error: "videoId is required" }, { status: 400 });
  }

  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Invalid videoId format" }, { status: 400 });
  }

  try {
    if (multiLang) {
      // Return both en and ja transcripts
      const transcripts = await fetchTranscriptWithYtDlp(videoId, ["en", "ja"]);
      return NextResponse.json(transcripts);
    } else {
      // Single language (backward compatible)
      const transcripts = await fetchTranscriptWithYtDlp(videoId, [lang]);
      return NextResponse.json(transcripts[lang] || []);
    }
  } catch (error) {
    console.error("Transcript fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch transcript" },
      { status: 500 }
    );
  }
}

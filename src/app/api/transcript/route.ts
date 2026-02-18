import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

type WordTiming = {
  text: string;
  offset: number;
};

type TranscriptItem = {
  text: string;
  offset: number;
  duration: number;
  words?: WordTiming[];
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
      const words: WordTiming[] = [];
      for (const seg of event.segs) {
        const w = (seg.utf8 || "").replace(/\n/g, " ").trim();
        if (w) {
          words.push({
            text: w,
            offset: event.tStartMs + (seg.tOffsetMs || 0),
          });
        }
      }

      items.push({
        text,
        offset: event.tStartMs,
        duration: event.dDurationMs,
        ...(words.length > 0 ? { words } : {}),
      });
    }
  }

  return items;
}

type FetchResult = {
  transcripts: Record<string, TranscriptItem[]>;
  subsType: Record<string, "manual" | "auto">;
};

async function fetchTranscriptWithYtDlp(
  videoId: string,
  langs: string[] = ["en"]
): Promise<FetchResult> {
  const tmpDir = os.tmpdir();
  const fileId = randomUUID();
  const outputPath = path.join(tmpDir, `transcript_${fileId}`);
  const langStr = langs.join(",");
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  const result: Record<string, TranscriptItem[]> = {};
  const subsType: Record<string, "manual" | "auto"> = {};

  // Phase 1: Try manual (uploaded) subtitles first — they have proper punctuation
  const manualCmd = `yt-dlp --cookies-from-browser chrome --write-sub --sub-lang ${langStr} --sub-format json3 --skip-download -o "${outputPath}" "${url}"`;
  try {
    await execAsync(manualCmd, { timeout: 30000 });
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr;
    if (stderr) console.warn(`[manual] yt-dlp: ${stderr.trim().split("\n").pop()}`);
  }

  for (const lang of langs) {
    const subtitlePath = `${outputPath}.${lang}.json3`;
    try {
      const content = await readFile(subtitlePath, "utf-8");
      const items = parseJson3(content);
      if (items.length > 0) {
        result[lang] = items;
        subsType[lang] = "manual";
      }
    } catch {
      // Not available
    } finally {
      try { await unlink(subtitlePath); } catch { /* ignore */ }
    }
  }

  // Phase 2: Fall back to auto-generated subs for missing languages
  const missingLangs = langs.filter((l) => !result[l]);
  if (missingLangs.length > 0) {
    const autoFileId = randomUUID();
    const autoOutputPath = path.join(tmpDir, `transcript_${autoFileId}`);
    const autoCmd = `yt-dlp --cookies-from-browser chrome --write-auto-sub --sub-lang ${missingLangs.join(",")} --sub-format json3 --skip-download -o "${autoOutputPath}" "${url}"`;

    try {
      await execAsync(autoCmd, { timeout: 30000 });
    } catch (err: unknown) {
      const stderr = (err as { stderr?: string }).stderr;
      if (stderr) console.warn(`[auto] yt-dlp: ${stderr.trim().split("\n").pop()}`);
    }

    for (const lang of missingLangs) {
      const subtitlePath = `${autoOutputPath}.${lang}.json3`;
      try {
        const content = await readFile(subtitlePath, "utf-8");
        const items = parseJson3(content);
        if (items.length > 0) {
          result[lang] = items;
          subsType[lang] = "auto";
        }
      } catch {
        // Not available
      } finally {
        try { await unlink(subtitlePath); } catch { /* ignore */ }
      }
    }
  }

  if (Object.keys(result).length === 0) {
    throw new Error("字幕を取得できませんでした");
  }

  return { transcripts: result, subsType };
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
      const { transcripts, subsType } = await fetchTranscriptWithYtDlp(videoId, ["en", "ja"]);
      return NextResponse.json({ ...transcripts, subsType });
    } else {
      // Single language (backward compatible)
      const { transcripts, subsType } = await fetchTranscriptWithYtDlp(videoId, [lang]);
      return NextResponse.json({ transcript: transcripts[lang] || [], subsType });
    }
  } catch (error) {
    console.error("Transcript fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch transcript" },
      { status: 500 }
    );
  }
}

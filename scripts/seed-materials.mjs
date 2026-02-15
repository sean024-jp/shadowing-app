/**
 * Bulk-add beginner-friendly materials (WPM < 100) to Supabase.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/seed-materials.mjs
 *
 * Requires: yt-dlp installed locally
 */

import { createClient } from "@supabase/supabase-js";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SUPABASE_URL = "https://qrbgtwkvwwdtmtdhfvsy.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required.");
  console.error("Usage: SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/seed-materials.mjs");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Candidate videos — curated for beginners (WPM < 100 expected)
// ---------------------------------------------------------------------------
const CANDIDATES = [
  // === Trump (tested - slow sections confirmed) ===
  { id: "QSUsXH3Ft6I", title: "Trump: National Prayer Breakfast", start: 300, end: 420 },
  { id: "XfrHtbDi2XI", title: "Trump: Prayer Breakfast 2026 - Religious Freedom", start: 0, end: 120 },
  { id: "c_9kY6sz_Uc", title: "Trump: UN General Assembly (Opening)", start: 0, end: 120 },
  { id: "c_9kY6sz_Uc", title: "Trump: UN General Assembly (Closing)", start: 2700, end: 2820 },
  { id: "MSEycl66RFk", title: "Trump: Davos World Economic Forum (WSJ)", start: 0, end: 120 },

  // === Steve Jobs ===
  { id: "UF8uR6Z6KLc", title: "Steve Jobs: Stanford Commencement - Stay Hungry, Stay Foolish", start: 840, end: 905 },

  // === Tim Cook ===
  { id: "ckjkz8zuMMs", title: "Tim Cook: MIT Commencement 2017 - Technology & Values", start: 480, end: 600 },

  // === Mark Zuckerberg ===
  { id: "BmYv8XGl-YU", title: "Zuckerberg: Harvard Commencement - Purpose", start: 1560, end: 1680 },
  { id: "BmYv8XGl-YU", title: "Zuckerberg: Harvard Commencement - Community", start: 1800, end: 1920 },

  // === Elon Musk ===
  { id: "bz7yYu_w2HY", title: "Elon Musk: Future, AI & Mars (Opening)", start: 0, end: 120 },

  // === Bill Gates ===
  { id: "KMEe2ni92rQ", title: "Bill Gates: Harvard Commencement - Opening", start: 0, end: 120 },
  { id: "KMEe2ni92rQ", title: "Bill Gates: Harvard Commencement - Closing", start: 1440, end: 1560 },

  // === Sundar Pichai ===
  { id: "UUheH1seQuE", title: "Sundar Pichai: You Will Prevail", start: 360, end: 480 },

  // === Jack Ma ===
  { id: "CZfp0ZUsBdM", title: "Jack Ma: We Never Give Up", start: 1440, end: 1509 },
  { id: "g25jcvtjZjA", title: "Jack Ma: Moscow University - Advice to Youth", start: 2580, end: 2700 },
  { id: "g25jcvtjZjA", title: "Jack Ma: Moscow University - Success & Failure", start: 3240, end: 3360 },
  { id: "NCBUakJbrw0", title: "Jack Ma: Most Influential Speech", start: 1920, end: 2002 },

  // === Denzel Washington ===
  { id: "ydj-gpaRgh8", title: "Denzel Washington: Dream Big, Work Hard", start: 60, end: 180 },

  // === Muniba Mazari ===
  { id: "fBnAMUkNM2k", title: "Muniba Mazari: We All Are Perfectly Imperfect", start: 2280, end: 2372 },
];

// ---------------------------------------------------------------------------
// JSON3 subtitle parser (same logic as src/app/api/transcript/route.ts)
// ---------------------------------------------------------------------------
function parseJson3(content) {
  const json = JSON.parse(content);
  const items = [];
  const events = json.events || [];

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

// ---------------------------------------------------------------------------
// Fetch subtitles with yt-dlp
// ---------------------------------------------------------------------------
async function fetchTranscript(videoId) {
  const tmpDir = os.tmpdir();
  const fileId = randomUUID();
  const outputPath = path.join(tmpDir, `seed_${fileId}`);

  const cmd = `yt-dlp --write-auto-sub --sub-lang en,ja --sub-format json3 --skip-download -o "${outputPath}" "https://www.youtube.com/watch?v=${videoId}"`;

  const result = {};

  try {
    await execAsync(cmd, { timeout: 30000 });
  } catch {
    // yt-dlp may exit non-zero if some languages fail — continue reading files
  }

  for (const lang of ["en", "ja"]) {
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
}

// ---------------------------------------------------------------------------
// WPM calculation (same logic as src/lib/wpm.ts)
// ---------------------------------------------------------------------------
function calculateWPM(transcript, startTime, endTime) {
  const totalWords = transcript.reduce(
    (sum, item) => sum + item.text.split(/\s+/).filter(Boolean).length,
    0
  );
  const durationMinutes = (endTime - startTime) / 60;
  if (durationMinutes <= 0) return 0;
  return Math.round(totalWords / durationMinutes);
}

// ---------------------------------------------------------------------------
// Filter transcript to time range
// ---------------------------------------------------------------------------
function filterTranscript(items, startTime, endTime) {
  const startMs = startTime * 1000;
  const endMs = endTime * 1000;
  return items.filter((item) => item.offset >= startMs && item.offset < endMs);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\nProcessing ${CANDIDATES.length} candidate videos...\n`);

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of CANDIDATES) {
    const label = `[${candidate.id}] ${candidate.title}`;

    try {
      // Check if already exists
      const { data: existing } = await supabase
        .from("materials")
        .select("id")
        .eq("youtube_id", candidate.id)
        .maybeSingle();

      if (existing) {
        console.log(`SKIP (exists): ${label}`);
        skipped++;
        continue;
      }

      // Fetch transcripts
      console.log(`Fetching: ${label}...`);
      const transcripts = await fetchTranscript(candidate.id);

      if (!transcripts.en || transcripts.en.length === 0) {
        console.log(`FAIL (no EN subtitle): ${label}`);
        failed++;
        continue;
      }

      // Find the best time range (adjust end if transcript is shorter)
      const lastItem = transcripts.en[transcripts.en.length - 1];
      const maxTime = Math.ceil((lastItem.offset + lastItem.duration) / 1000);
      let startTime = candidate.start;
      let endTime = Math.min(candidate.end, maxTime);

      // Ensure minimum 30 seconds
      if (endTime - startTime < 30) {
        endTime = Math.min(startTime + 60, maxTime);
        if (endTime - startTime < 30) {
          console.log(`FAIL (too short): ${label}`);
          failed++;
          continue;
        }
      }

      // Filter transcript to range
      const selectedEn = filterTranscript(transcripts.en, startTime, endTime);
      const selectedJa = transcripts.ja ? filterTranscript(transcripts.ja, startTime, endTime) : [];

      if (selectedEn.length === 0) {
        console.log(`FAIL (no EN in range): ${label}`);
        failed++;
        continue;
      }

      // Calculate WPM
      const wpm = calculateWPM(selectedEn, startTime, endTime);

      if (wpm >= 100) {
        console.log(`SKIP (WPM ${wpm} >= 100): ${label}`);
        skipped++;
        continue;
      }

      // Insert into Supabase
      const { error: insertError } = await supabase.from("materials").insert({
        youtube_url: `https://www.youtube.com/watch?v=${candidate.id}`,
        youtube_id: candidate.id,
        title: candidate.title,
        start_time: startTime,
        end_time: endTime,
        transcript: selectedEn,
        transcript_ja: selectedJa.length > 0 ? selectedJa : null,
        wpm,
      });

      if (insertError) {
        console.log(`FAIL (insert): ${label} — ${insertError.message}`);
        failed++;
        continue;
      }

      console.log(`OK (${wpm} WPM, ${endTime - startTime}s): ${label}`);
      inserted++;
    } catch (err) {
      console.log(`FAIL (error): ${label} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n--- Results ---`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Failed:   ${failed}`);
  console.log(`Total:    ${CANDIDATES.length}`);
}

main().catch(console.error);

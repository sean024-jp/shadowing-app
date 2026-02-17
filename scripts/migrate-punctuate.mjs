/**
 * One-time migration: punctuate existing materials' English transcripts.
 *
 * For each material:
 *   1. Try to re-fetch manual (uploaded) subtitles from YouTube
 *   2. If manual subs available → replace transcript with properly punctuated version
 *   3. Otherwise → send existing auto-sub text to Gemini for punctuation
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx GOOGLE_API_KEY=xxx node scripts/migrate-punctuate.mjs
 *
 * Options:
 *   --dry-run   Show before/after without updating DB (default)
 *   --apply     Actually update the database
 *
 * Requires: yt-dlp installed locally
 */

import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
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
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY is required.");
  process.exit(1);
}
if (!GOOGLE_API_KEY) {
  console.error("Error: GOOGLE_API_KEY is required.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

const dryRun = !process.argv.includes("--apply");

// ---------------------------------------------------------------------------
// JSON3 parser (same as seed-materials.mjs)
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
// Fetch manual subtitles for a video
// ---------------------------------------------------------------------------
async function fetchManualSubs(videoId, lang = "en") {
  const tmpDir = os.tmpdir();
  const fileId = randomUUID();
  const outputPath = path.join(tmpDir, `migrate_${fileId}`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  const cmd = `yt-dlp --cookies-from-browser chrome --write-sub --sub-lang ${lang} --sub-format json3 --skip-download -o "${outputPath}" "${url}"`;

  try {
    await execAsync(cmd, { timeout: 60000 });
  } catch {
    // No manual subs
  }

  const subtitlePath = `${outputPath}.${lang}.json3`;
  try {
    const content = await readFile(subtitlePath, "utf-8");
    const items = parseJson3(content);
    return items.length > 0 ? items : null;
  } catch {
    return null;
  } finally {
    try { await unlink(subtitlePath); } catch { /* ignore */ }
  }
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
// Punctuate using Gemini
// ---------------------------------------------------------------------------
const DELIMITER = " ||| ";

async function punctuateChunks(items) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const concatenated = items.map((item) => item.text).join(DELIMITER);

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
  const chunks = punctuated.split(DELIMITER);

  if (chunks.length !== items.length) {
    throw new Error(`Chunk mismatch: expected ${items.length}, got ${chunks.length}`);
  }

  return items
    .map((item, i) => ({ ...item, text: chunks[i].trim() }))
    .filter((item) => item.text.length > 0);
}

// ---------------------------------------------------------------------------
// WPM calculation
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
// Check if transcript likely needs punctuation
// ---------------------------------------------------------------------------
function needsPunctuation(items) {
  const fullText = items.map((i) => i.text).join(" ");
  // Count sentences ending with . ! ?
  const sentenceEndings = (fullText.match(/[.!?]/g) || []).length;
  // If fewer than 2 sentence endings in 200+ chars of text, it's unpunctuated
  return fullText.length > 200 && sentenceEndings < 2;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(dryRun ? "=== DRY RUN (use --apply to update DB) ===\n" : "=== APPLYING CHANGES ===\n");

  // Fetch all materials
  const { data: materials, error } = await supabase
    .from("materials")
    .select("id, title, youtube_id, start_time, end_time, transcript, wpm")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`Failed to fetch materials: ${error.message}`);
    process.exit(1);
  }

  console.log(`Found ${materials.length} materials.\n`);

  // Cache manual subs per videoId
  const manualSubsCache = new Map();

  let updated = 0;
  let skippedOk = 0;
  let skippedError = 0;

  for (const mat of materials) {
    const label = `[${mat.youtube_id}] ${mat.title}`;

    // Check if it needs punctuation
    if (!needsPunctuation(mat.transcript)) {
      console.log(`SKIP (already punctuated): ${label}`);
      skippedOk++;
      continue;
    }

    console.log(`\nPROCESS: ${label}`);
    const beforeSample = mat.transcript.slice(0, 3).map((t) => t.text).join(" | ");
    console.log(`  Before: ${beforeSample}`);

    try {
      let newTranscript;
      let source;

      // Try manual subs first
      if (!manualSubsCache.has(mat.youtube_id)) {
        console.log(`  Fetching manual subs for ${mat.youtube_id}...`);
        const manualSubs = await fetchManualSubs(mat.youtube_id);
        manualSubsCache.set(mat.youtube_id, manualSubs);
      }

      const manualSubs = manualSubsCache.get(mat.youtube_id);
      if (manualSubs) {
        const filtered = filterTranscript(manualSubs, mat.start_time, mat.end_time);
        if (filtered.length > 0) {
          newTranscript = filtered;
          source = "manual-subs";
        }
      }

      // Fall back to Gemini punctuation
      if (!newTranscript) {
        console.log(`  No manual subs, using Gemini...`);
        newTranscript = await punctuateChunks(mat.transcript);
        source = "gemini";
        // Rate limit delay
        await new Promise((r) => setTimeout(r, 1000));
      }

      const afterSample = newTranscript.slice(0, 3).map((t) => t.text).join(" | ");
      console.log(`  After (${source}): ${afterSample}`);

      // Recalculate WPM
      const newWpm = calculateWPM(newTranscript, mat.start_time, mat.end_time);

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from("materials")
          .update({ transcript: newTranscript, wpm: newWpm })
          .eq("id", mat.id);

        if (updateError) {
          console.log(`  ERROR updating: ${updateError.message}`);
          skippedError++;
          continue;
        }
        console.log(`  UPDATED (WPM: ${mat.wpm} → ${newWpm})`);
      } else {
        console.log(`  Would update (WPM: ${mat.wpm} → ${newWpm})`);
      }

      updated++;
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      skippedError++;
    }
  }

  console.log(`\n--- Results ---`);
  console.log(`Updated:  ${updated}`);
  console.log(`Skipped (OK):    ${skippedOk}`);
  console.log(`Skipped (error): ${skippedError}`);
  console.log(`Total:    ${materials.length}`);

  if (dryRun && updated > 0) {
    console.log(`\nRun with --apply to update the database.`);
  }
}

main().catch(console.error);

/**
 * Migration: Add word-level timing to EN transcripts + align JA to EN segments.
 *
 * Phase 1 (this script): yt-dlp + Gemini processing → outputs /tmp/migration-results.json
 * Phase 2: Execute SQL updates via MCP (done externally)
 *
 * For each material:
 *   1. Re-fetch EN JSON3 from YouTube (to get word-level timing)
 *   2. Parse with parseJson3 (preserves words array)
 *   3. Match existing punctuated EN text to fresh segments by offset
 *   4. Align JA transcript to EN segments via Gemini
 *   5. Write results to output file
 *
 * Usage:
 *   node scripts/migrate-words-and-ja.mjs [--input /tmp/migration-input.json]
 *
 * Env:
 *   GOOGLE_API_KEY (reads from .env.local if not set)
 *
 * Requires: yt-dlp + Chrome cookies installed locally
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Load .env.local for GOOGLE_API_KEY
// ---------------------------------------------------------------------------
async function loadEnvLocal() {
  try {
    const content = await readFile(
      path.join(process.cwd(), ".env.local"),
      "utf-8"
    );
    for (const line of content.split("\n")) {
      const match = line.match(/^([A-Z_]+)=(.+)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  } catch {}
}

await loadEnvLocal();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) {
  console.error("Error: GOOGLE_API_KEY is required (set in env or .env.local)");
  process.exit(1);
}

const INPUT_FILE =
  process.argv.find((a) => a.startsWith("--input="))?.split("=")[1] ||
  "/tmp/migration-input.json";
const OUTPUT_FILE = "/tmp/migration-results.json";
const JA_ONLY = process.argv.includes("--ja-only"); // Skip yt-dlp, use existing results for EN

const DELIMITER = " ||| ";

// ---------------------------------------------------------------------------
// JSON3 parser with word-level timing
// ---------------------------------------------------------------------------
function parseJson3(content) {
  const json = JSON.parse(content);
  const items = [];
  for (const event of json.events || []) {
    if (!event.segs || event.segs.length === 0) continue;
    const text = event.segs
      .map((seg) => seg.utf8 || "")
      .join("")
      .replace(/\n/g, " ")
      .trim();
    if (text) {
      const words = [];
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

// ---------------------------------------------------------------------------
// Fetch EN subs with word timing (manual first, then auto)
// ---------------------------------------------------------------------------
const enCache = new Map();

async function fetchEnJson3(videoId) {
  if (enCache.has(videoId)) return enCache.get(videoId);

  const tmpDir = os.tmpdir();
  const fileId = randomUUID();
  const outputPath = path.join(tmpDir, `migrate_en_${fileId}`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // Try manual subs first
  const manualCmd = `yt-dlp --cookies-from-browser chrome --write-sub --sub-lang en --sub-format json3 --skip-download -o "${outputPath}_manual" "${url}"`;
  try {
    await execAsync(manualCmd, { timeout: 60000 });
    const content = await readFile(`${outputPath}_manual.en.json3`, "utf-8");
    const items = parseJson3(content);
    if (items.length > 0) {
      enCache.set(videoId, { items, type: "manual" });
      try {
        await unlink(`${outputPath}_manual.en.json3`);
      } catch {}
      return { items, type: "manual" };
    }
  } catch {}
  try {
    await unlink(`${outputPath}_manual.en.json3`);
  } catch {}

  // Fall back to auto-sub
  const autoCmd = `yt-dlp --cookies-from-browser chrome --write-auto-sub --sub-lang en --sub-format json3 --skip-download -o "${outputPath}_auto" "${url}"`;
  try {
    await execAsync(autoCmd, { timeout: 60000 });
    const content = await readFile(`${outputPath}_auto.en.json3`, "utf-8");
    const items = parseJson3(content);
    if (items.length > 0) {
      enCache.set(videoId, { items, type: "auto" });
      try {
        await unlink(`${outputPath}_auto.en.json3`);
      } catch {}
      return { items, type: "auto" };
    }
  } catch (err) {
    console.error(
      `  FAILED to fetch EN for ${videoId}: ${err.stderr?.trim().split("\n").pop() || err.message}`
    );
  }
  try {
    await unlink(`${outputPath}_auto.en.json3`);
  } catch {}

  enCache.set(videoId, null);
  return null;
}

// ---------------------------------------------------------------------------
// Fetch JA subs (for reference text)
// ---------------------------------------------------------------------------
const jaCache = new Map();

async function fetchJaJson3(videoId) {
  if (jaCache.has(videoId)) return jaCache.get(videoId);

  const tmpDir = os.tmpdir();
  const fileId = randomUUID();
  const outputPath = path.join(tmpDir, `migrate_ja_${fileId}`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // Try auto-sub for JA (auto-translated)
  const cmd = `yt-dlp --cookies-from-browser chrome --write-auto-sub --sub-lang ja --sub-format json3 --skip-download -o "${outputPath}" "${url}"`;
  try {
    await execAsync(cmd, { timeout: 60000 });
    const content = await readFile(`${outputPath}.ja.json3`, "utf-8");
    const items = parseJson3(content);
    if (items.length > 0) {
      jaCache.set(videoId, items);
      try {
        await unlink(`${outputPath}.ja.json3`);
      } catch {}
      return items;
    }
  } catch (err) {
    console.error(
      `  FAILED to fetch JA for ${videoId}: ${err.stderr?.trim().split("\n").pop() || err.message}`
    );
  }
  try {
    await unlink(`${outputPath}.ja.json3`);
  } catch {}

  jaCache.set(videoId, null);
  return null;
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
// Punctuate EN via Gemini
// ---------------------------------------------------------------------------
async function punctuateChunks(chunks) {
  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const concatenated = chunks.join(DELIMITER);

  const prompt = `You are a punctuation restoration tool for English speech transcripts.

The following text is from an auto-generated YouTube subtitle. It lacks punctuation and proper capitalization.

The text contains segments separated by "${DELIMITER}" (space-pipe-pipe-pipe-space). You MUST preserve every "${DELIMITER}" delimiter exactly as-is. Do NOT add, remove, or move any delimiter.

Your task:
1. Add proper punctuation (periods, commas, question marks, exclamation marks, apostrophes, colons)
2. Capitalize the first letter of each sentence
3. Capitalize proper nouns (names, brands, places — e.g. "apple" → "Apple", "ipod" → "iPod", "macintosh" → "Macintosh")
4. Remove filler artifacts like "[Applause]", "[Music]", "[Laughter]" — replace with empty string
5. Do NOT change any words, do NOT rephrase, do NOT add words, do NOT remove spoken words

Return ONLY the corrected text with delimiters preserved. No explanations, no markdown.

Text:
${concatenated}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`    Punctuation retry ${attempt}...`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
      const result = await model.generateContent(prompt);
      const punctuated = result.response.text().trim();
      let punctuatedChunks = punctuated.split(DELIMITER);
      if (punctuatedChunks.length !== chunks.length) {
        punctuatedChunks = punctuated.split("|||").map((c) => c.trim());
      }

      if (punctuatedChunks.length !== chunks.length) {
        console.warn(
          `    Punctuation mismatch (expected ${chunks.length}, got ${punctuatedChunks.length})`
        );
        continue; // retry
      }

      return punctuatedChunks.map((c) => c.trim());
    } catch (err) {
      if (err.message?.includes("429")) {
        console.warn(`    Rate limited, waiting 10s...`);
        await new Promise((r) => setTimeout(r, 10000));
        continue;
      }
      throw err;
    }
  }
  console.warn(`    Punctuation retries exhausted, using original`);
  return chunks;
}

// ---------------------------------------------------------------------------
// Align JA to EN via Gemini (batch processing for reliability)
// ---------------------------------------------------------------------------
const BATCH_SIZE = 12;

async function alignBatch(enBatch, jaText) {
  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const enConcat = enBatch.map((item) => item.text).join(DELIMITER);

  const prompt = `You are a Japanese translation alignment tool for English speech transcripts.

You are given:
1. ${enBatch.length} English transcript segments separated by " ||| " delimiters
2. A reference Japanese translation of the same speech

Your task: Produce exactly ${enBatch.length} Japanese translations, one for each English segment, separated by " ||| " delimiters.

CRITICAL: Your output MUST contain exactly ${enBatch.length - 1} " ||| " delimiters, producing exactly ${enBatch.length} segments. Count carefully.

Rules:
- Use the reference Japanese as a guide for terminology and meaning
- Each Japanese segment corresponds to the English segment at the same position
- Even short English fragments need a Japanese translation
- Remove [拍手], [音楽], [笑い], [Applause], [Music] artifacts
- Return ONLY the delimited Japanese text. No explanations, no markdown.

English segments:
${enConcat}

Reference Japanese:
${jaText}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
      const result = await model.generateContent(prompt);
      const aligned = result.response.text().trim();
      let chunks = aligned.split(DELIMITER);
      if (chunks.length !== enBatch.length) {
        chunks = aligned.split("|||").map((c) => c.trim());
      }
      if (chunks.length === enBatch.length) {
        return chunks.map((c) => c.trim() || "—");
      }
    } catch (err) {
      if (err.message?.includes("429")) {
        await new Promise((r) => setTimeout(r, 10000));
        continue;
      }
      throw err;
    }
  }
  return null;
}

async function alignJaToEn(enItems, jaText) {
  if (enItems.length === 0 || !jaText) return null;

  // Process in batches for reliability
  const allChunks = [];
  const totalBatches = Math.ceil(enItems.length / BATCH_SIZE);

  for (let b = 0; b < totalBatches; b++) {
    const start = b * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, enItems.length);
    const batch = enItems.slice(start, end);

    const batchResult = await alignBatch(batch, jaText);
    if (!batchResult) {
      console.warn(`    Batch ${b + 1}/${totalBatches} failed`);
      return null;
    }
    allChunks.push(...batchResult);
    if (b < totalBatches - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return enItems.map((en, i) => ({
    text: allChunks[i],
    offset: en.offset,
    duration: en.duration,
  }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(JA_ONLY ? "=== JA-Only Mode (re-align JA using existing EN results) ===\n" : "=== Migration: Word Timing + JA Alignment ===\n");

  // Read input
  const materials = JSON.parse(await readFile(INPUT_FILE, "utf-8"));
  console.log(`Loaded ${materials.length} materials from ${INPUT_FILE}\n`);

  // In JA-only mode, load existing results for EN data
  let existingResults = {};
  if (JA_ONLY) {
    try {
      existingResults = JSON.parse(await readFile(OUTPUT_FILE, "utf-8"));
      console.log(`Loaded existing results (${Object.keys(existingResults).length} materials)\n`);
    } catch {
      console.error(`Error: --ja-only requires existing ${OUTPUT_FILE}`);
      process.exit(1);
    }
  }

  if (!JA_ONLY) {
    // Pre-fetch EN subs per unique video
    const videoIds = [...new Set(materials.map((m) => m.youtube_id))];
    console.log(`Fetching EN subtitles for ${videoIds.length} unique videos...\n`);

    for (let i = 0; i < videoIds.length; i++) {
      if (i > 0) {
        console.log("  (waiting 3s...)");
        await new Promise((r) => setTimeout(r, 3000));
      }
      const vid = videoIds[i];
      console.log(`  Fetching EN: ${vid}...`);
      const result = await fetchEnJson3(vid);
      console.log(
        `    → ${result ? `${result.type} (${result.items.length} events)` : "FAILED"}`
      );
    }
  }

  // JA reference text: use ja_concat from input file if available, else fetch from YouTube
  const hasJaInInput = materials.some((m) => m.ja_concat);
  if (hasJaInInput) {
    console.log(`Using JA reference text from input file\n`);
  } else {
    const videoIds = [...new Set(materials.map((m) => m.youtube_id))];
    console.log(`\nFetching JA subtitles...\n`);
    for (let i = 0; i < videoIds.length; i++) {
      if (i > 0) {
        console.log("  (waiting 3s...)");
        await new Promise((r) => setTimeout(r, 3000));
      }
      const vid = videoIds[i];
      console.log(`  Fetching JA: ${vid}...`);
      const result = await fetchJaJson3(vid);
      console.log(`    → ${result ? `${result.length} events` : "FAILED"}`);
    }
  }

  console.log(`\nProcessing materials...\n`);

  const results = { ...existingResults };
  let processed = 0;
  let skipped = 0;

  for (const mat of materials) {
    const label = `[${mat.youtube_id}] ${mat.title}`;

    try {
      let freshEn;

      if (JA_ONLY) {
        // Use existing EN results
        const existing = existingResults[mat.id];
        if (!existing || !existing.transcript) {
          console.log(`SKIP (no existing EN): ${label}`);
          skipped++;
          continue;
        }
        // Already has aligned JA? Skip
        if (existing.transcript_ja && existing.transcript_ja.length === existing.transcript.length) {
          console.log(`SKIP (already aligned): ${label}`);
          continue;
        }
        freshEn = existing.transcript;
      } else {
        const enData = enCache.get(mat.youtube_id);
        if (!enData) {
          console.log(`SKIP (no EN): ${label}`);
          skipped++;
          continue;
        }

        // Filter EN to time range
        freshEn = filterTranscript(enData.items, mat.start_time, mat.end_time);
        if (freshEn.length === 0) {
          console.log(`SKIP (no EN in range): ${label}`);
          skipped++;
          continue;
        }

        // Punctuate EN text (auto-subs lack punctuation)
        if (enData.type === "auto") {
          console.log(`  Punctuating EN...`);
          const rawTexts = freshEn.map((item) => item.text);
          const punctuated = await punctuateChunks(rawTexts);
          for (let i = 0; i < freshEn.length; i++) {
            freshEn[i].text = punctuated[i];
          }
          console.log(`    → OK`);
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      console.log(`PROCESS: ${label}`);
      console.log(`  EN: ${freshEn.length} segments`);

      // Get JA reference text (from input file or YouTube cache)
      let jaText = null;
      if (mat.ja_concat) {
        // Use pre-loaded JA from DB (via input file)
        jaText = mat.ja_concat.replace(/\|\|\|/g, "");
      } else {
        const jaItems = jaCache.get(mat.youtube_id);
        const jaFiltered = jaItems
          ? filterTranscript(jaItems, mat.start_time, mat.end_time)
          : null;
        jaText =
          jaFiltered && jaFiltered.length > 0
            ? jaFiltered.map((item) => item.text).join("")
            : null;
      }

      // Align JA to EN
      let newJa = null;
      if (jaText) {
        console.log(`  Aligning JA...`);
        newJa = await alignJaToEn(freshEn, jaText);
        if (newJa) {
          console.log(`    → OK (${newJa.length} segments)`);
        } else {
          console.log(`    → Failed`);
        }
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        console.log(`  No JA reference available`);
      }

      // Build result (preserve EN with words)
      const newEn = freshEn.map((item) => ({
        text: item.text,
        offset: item.offset,
        duration: item.duration,
        ...(item.words ? { words: item.words } : {}),
      }));

      results[mat.id] = {
        title: mat.title,
        transcript: newEn,
        transcript_ja: newJa,
      };
      processed++;
      console.log(`  → Done (EN: ${newEn.length}, JA: ${newJa?.length || 0})`);
    } catch (err) {
      console.log(`ERROR: ${label} — ${err.message}`);
      skipped++;
    }
  }

  // Write results
  await writeFile(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\n--- Results ---`);
  console.log(`Processed: ${processed}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Total:     ${materials.length}`);
  console.log(`\nResults written to ${OUTPUT_FILE}`);
}

main().catch(console.error);

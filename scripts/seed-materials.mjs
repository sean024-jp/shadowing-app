/**
 * Seed curated famous speech materials into Supabase.
 * Each section is manually selected for semantic coherence and thematic completeness.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/seed-materials.mjs
 *
 * Options:
 *   --delete-all   Delete all existing materials before inserting
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

if (!SERVICE_ROLE_KEY) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required.");
  console.error("Usage: SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/seed-materials.mjs");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Curated materials — semantically coherent sections of famous speeches
// ---------------------------------------------------------------------------
const CANDIDATES = [
  // === Steve Jobs ===
  // iPhone 2007 Keynote — The legendary "three revolutionary products" reveal
  { id: "MnrJzXM7a6o", title: "Steve Jobs: Introducing the iPhone", start: 0, end: 198, category: "business" },

  // Stanford 2005 — Calligraphy class at Reed → became Mac's beautiful typography
  { id: "UF8uR6Z6KLc", title: "Steve Jobs: The Calligraphy That Changed Computing", start: 193, end: 290, category: "business" },

  // Stanford 2005 — Cancer diagnosis, surgery, "death is life's change agent"
  { id: "UF8uR6Z6KLc", title: "Steve Jobs: Facing Death", start: 537, end: 663, category: "business" },

  // Stanford 2005 — "Don't waste it living someone else's life" → "Stay Hungry, Stay Foolish"
  { id: "UF8uR6Z6KLc", title: "Steve Jobs: Stay Hungry, Stay Foolish", start: 759, end: 890, category: "business" },

  // === Bill Gates ===
  // Harvard 2007 — Humorous opening: "Dad, I always told you I'd come back for my degree"
  { id: "zPx5N6Lh3sw", title: "Bill Gates: I Always Told You I'd Come Back", start: 185, end: 283, category: "business" },

  // Harvard 2007 — Core message: greatest advances reduce inequity
  { id: "zPx5N6Lh3sw", title: "Bill Gates: Humanity's Greatest Advances Reduce Inequity", start: 439, end: 532, category: "business" },

  // Harvard 2007 — Mother's letter: "from those to whom much is given, much is expected"
  { id: "zPx5N6Lh3sw", title: "Bill Gates: From Those to Whom Much Is Given", start: 1467, end: 1623, category: "business" },

  // === Trump ===
  // Inaugural Address 2017 — "We all bleed the same red blood" → "Make America Great Again"
  { id: "3WFwBPTU2I8", title: "Trump: We All Bleed the Same Red Blood", start: 3, end: 115, category: "business" },

  // UN General Assembly 2025 — Teleprompter malfunction, "speak from the heart"
  { id: "8vYy6-R6pXk", title: "Trump: Speaking from the Heart", start: 22, end: 118, category: "business" },

  // UN General Assembly 2025 — Ended seven "unendable" wars in seven months
  { id: "8vYy6-R6pXk", title: "Trump: Seven Wars Ended in Seven Months", start: 487, end: 580, category: "business" },

  // === Tim Cook ===
  // MIT 2017 — 15-year search for purpose: high school, college, grad school, "even a Windows PC"
  { id: "ckjkz8zuMMs", title: "Tim Cook: A 15-Year Search for Purpose", start: 105, end: 199, category: "business" },

  // MIT 2017 — Finding Apple, Steve Jobs, "How will you serve humanity?"
  { id: "ckjkz8zuMMs", title: "Tim Cook: How Will You Serve Humanity", start: 229, end: 356, category: "business" },

  // MIT 2017 — Meeting Pope Francis: "Never has humanity had such power over itself"
  { id: "ckjkz8zuMMs", title: "Tim Cook: Never Has Humanity Had Such Power", start: 418, end: 512, category: "business" },

  // === Elon Musk ===
  // World Government Summit — Meaning of life, multiplanetary species, sense of adventure
  { id: "bz7yYu_w2HY", title: "Elon Musk: Why We Must Be Multiplanetary", start: 107, end: 198, category: "business" },

  // World Government Summit — Self-driving cars, elevator analogy
  { id: "bz7yYu_w2HY", title: "Elon Musk: Self-Driving Will Be Like Elevators", start: 509, end: 607, category: "business" },

  // World Government Summit — Physics thinking framework, "be less wrong over time"
  { id: "bz7yYu_w2HY", title: "Elon Musk: Be Less Wrong Over Time", start: 1997, end: 2100, category: "business" },

  // === Mark Zuckerberg ===
  // Harvard 2017 — JFK janitor story: "I'm helping put a man on the moon"
  { id: "BmYv8XGl-YU", title: "Zuckerberg: Purpose Creates True Happiness", start: 312, end: 403, category: "business" },

  // Harvard 2017 — Nearly sold Facebook, felt alone, learned about higher purpose
  { id: "BmYv8XGl-YU", title: "Zuckerberg: The Hardest Time Leading Facebook", start: 525, end: 619, category: "business" },

  // Harvard 2017 — "Ideas don't come out fully formed" + JK Rowling rejected 12 times
  { id: "BmYv8XGl-YU", title: "Zuckerberg: Ideas Don't Come Out Fully Formed", start: 680, end: 775, category: "business" },

  // Harvard 2017 — Universal basic income, new social contract, "giving everyone freedom"
  { id: "BmYv8XGl-YU", title: "Zuckerberg: A New Social Contract", start: 1062, end: 1163, category: "business" },
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
// Fetch subtitles with yt-dlp (cache per videoId to avoid re-fetching)
// Manual subs first → auto-sub fallback
// ---------------------------------------------------------------------------
const transcriptCache = new Map();
const LANGS = ["en", "ja"];

async function fetchTranscript(videoId) {
  if (transcriptCache.has(videoId)) {
    return transcriptCache.get(videoId);
  }

  const tmpDir = os.tmpdir();
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const result = {};
  const subsType = {};

  // Phase 1: Try manual (uploaded) subtitles
  const manualId = randomUUID();
  const manualPath = path.join(tmpDir, `seed_manual_${manualId}`);
  const manualCmd = `yt-dlp --cookies-from-browser chrome --write-sub --sub-lang ${LANGS.join(",")} --sub-format json3 --skip-download -o "${manualPath}" "${url}"`;

  try {
    await execAsync(manualCmd, { timeout: 60000 });
  } catch (err) {
    if (err.stderr) console.warn(`    [manual] stderr: ${err.stderr.trim().split("\n").pop()}`);
  }

  for (const lang of LANGS) {
    const subtitlePath = `${manualPath}.${lang}.json3`;
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

  // Phase 2: Fall back to auto-sub for missing languages
  const missingLangs = LANGS.filter((l) => !result[l]);
  if (missingLangs.length > 0) {
    const autoId = randomUUID();
    const autoPath = path.join(tmpDir, `seed_auto_${autoId}`);
    const autoCmd = `yt-dlp --cookies-from-browser chrome --write-auto-sub --sub-lang ${missingLangs.join(",")} --sub-format json3 --skip-download -o "${autoPath}" "${url}"`;

    try {
      await execAsync(autoCmd, { timeout: 60000 });
    } catch (err) {
      if (err.stderr) console.warn(`    [auto] stderr: ${err.stderr.trim().split("\n").pop()}`);
    }

    for (const lang of missingLangs) {
      const subtitlePath = `${autoPath}.${lang}.json3`;
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

  const cached = { ...result, subsType };
  transcriptCache.set(videoId, cached);
  return cached;
}

// ---------------------------------------------------------------------------
// Punctuate auto-generated transcript chunks using Gemini
// ---------------------------------------------------------------------------
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const DELIMITER = " ||| ";

async function punctuateChunks(items) {
  if (!GOOGLE_API_KEY || items.length === 0) return items;

  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
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

  try {
    const result = await model.generateContent(prompt);
    const punctuated = result.response.text().trim();
    const chunks = punctuated.split(DELIMITER);

    if (chunks.length !== items.length) {
      console.warn(`    Punctuation chunk mismatch (expected ${items.length}, got ${chunks.length}), using original`);
      return items;
    }

    return items
      .map((item, i) => ({ ...item, text: chunks[i].trim() }))
      .filter((item) => item.text.length > 0);
  } catch (err) {
    console.warn(`    Punctuation failed: ${err.message}`);
    return items;
  }
}

// ---------------------------------------------------------------------------
// Align JA transcript to EN segments using Gemini
// ---------------------------------------------------------------------------
async function alignJaToEn(enItems, jaItems) {
  if (!GOOGLE_API_KEY || enItems.length === 0 || jaItems.length === 0) return null;
  if (enItems.length === jaItems.length) return jaItems; // Already aligned

  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const enConcat = enItems.map((item) => item.text).join(DELIMITER);
  const jaText = jaItems.map((item) => item.text).join("");

  const prompt = `You are a Japanese translation alignment tool for English speech transcripts.

You are given:
1. English transcript segments separated by "${DELIMITER.trim()}" delimiters
2. A reference Japanese translation of the same speech

Your task: Produce a Japanese translation for EACH English segment, using "${DELIMITER.trim()}" as delimiter between segments.

Rules:
- Output MUST have exactly the same number of "${DELIMITER.trim()}" delimiters as the input (${enItems.length - 1} delimiters for ${enItems.length} segments)
- Use the reference Japanese translation as a guide for terminology and meaning
- Each Japanese segment should be a natural translation of its corresponding English segment
- Even if an English segment is a short fragment (e.g., "a half years."), produce a natural Japanese fragment for it
- Remove artifacts like [拍手], [音楽], [笑い], [Applause], [Music] — replace with empty string
- Do NOT add, remove, or reposition any "${DELIMITER.trim()}" delimiter
- Return ONLY the Japanese text with delimiters. No explanations, no markdown.

English segments:
${enConcat}

Reference Japanese:
${jaText}`;

  try {
    const result = await model.generateContent(prompt);
    const aligned = result.response.text().trim();
    const chunks = aligned.split(DELIMITER);

    if (chunks.length !== enItems.length) {
      console.warn(`    Alignment chunk mismatch (expected ${enItems.length}, got ${chunks.length}), skipping alignment`);
      return null;
    }

    return enItems.map((en, i) => ({
      text: chunks[i].trim() || "—",
      offset: en.offset,
      duration: en.duration,
    }));
  } catch (err) {
    console.warn(`    Alignment failed: ${err.message}`);
    return null;
  }
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
  const deleteAll = process.argv.includes("--delete-all");

  if (deleteAll) {
    console.log("Deleting all existing materials...");
    const { error } = await supabase.from("materials").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      console.error(`Failed to delete: ${error.message}`);
      process.exit(1);
    }
    console.log("All materials deleted.\n");
  }

  console.log(`Processing ${CANDIDATES.length} curated materials...\n`);

  // Group by videoId to fetch transcripts efficiently
  const videoIds = [...new Set(CANDIDATES.map((c) => c.id))];
  console.log(`Fetching transcripts for ${videoIds.length} unique videos...\n`);

  for (let i = 0; i < videoIds.length; i++) {
    const videoId = videoIds[i];
    if (i > 0) {
      console.log(`    (waiting 3s to avoid rate limiting...)`);
      await new Promise((r) => setTimeout(r, 3000));
    }
    console.log(`  Fetching subtitles: ${videoId}...`);
    const result = await fetchTranscript(videoId);
    const types = Object.entries(result.subsType || {}).map(([l, t]) => `${l}:${t}`).join(", ");
    console.log(`    → ${types || "no subs"}`);
  }

  console.log(`\nInserting materials...\n`);

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of CANDIDATES) {
    const label = `[${candidate.id}] ${candidate.title}`;

    try {
      // Check if already exists (same video + same time range)
      const { data: existing } = await supabase
        .from("materials")
        .select("id")
        .eq("youtube_id", candidate.id)
        .eq("start_time", candidate.start)
        .eq("end_time", candidate.end)
        .maybeSingle();

      if (existing) {
        console.log(`SKIP (exists): ${label}`);
        skipped++;
        continue;
      }

      const cached = transcriptCache.get(candidate.id);

      if (!cached?.en || cached.en.length === 0) {
        console.log(`FAIL (no EN subtitle): ${label}`);
        failed++;
        continue;
      }

      // Adjust end time if transcript is shorter
      const lastItem = cached.en[cached.en.length - 1];
      const maxTime = Math.ceil((lastItem.offset + lastItem.duration) / 1000);
      let startTime = candidate.start;
      let endTime = Math.min(candidate.end, maxTime);

      if (endTime - startTime < 30) {
        console.log(`FAIL (too short): ${label}`);
        failed++;
        continue;
      }

      // Filter transcript to range
      let selectedEn = filterTranscript(cached.en, startTime, endTime);
      const selectedJa = cached.ja ? filterTranscript(cached.ja, startTime, endTime) : [];

      // Punctuate auto-generated English subs
      if (cached.subsType?.en === "auto" && selectedEn.length > 0) {
        console.log(`  Punctuating (auto-sub): ${label}...`);
        selectedEn = await punctuateChunks(selectedEn);
        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (selectedEn.length === 0) {
        console.log(`FAIL (no EN in range): ${label}`);
        failed++;
        continue;
      }

      // Align JA to EN segments
      let alignedJa = selectedJa;
      if (selectedJa.length > 0 && selectedEn.length > 0) {
        console.log(`  Aligning JA (${selectedJa.length} → ${selectedEn.length}): ${label}...`);
        const result = await alignJaToEn(selectedEn, selectedJa);
        if (result) {
          alignedJa = result;
          console.log(`    → Aligned successfully`);
        } else {
          console.warn(`    → Using raw JA`);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Calculate WPM
      const wpm = calculateWPM(selectedEn, startTime, endTime);

      // Insert into Supabase
      const { error: insertError } = await supabase.from("materials").insert({
        youtube_url: `https://www.youtube.com/watch?v=${candidate.id}`,
        youtube_id: candidate.id,
        title: candidate.title,
        start_time: startTime,
        end_time: endTime,
        transcript: selectedEn,
        transcript_ja: alignedJa.length > 0 ? alignedJa : null,
        wpm,
        category: candidate.category || "business",
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

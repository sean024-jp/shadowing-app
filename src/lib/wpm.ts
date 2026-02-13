import type { TranscriptItem } from "@/types/models";

export function calculateWPM(
  transcript: TranscriptItem[],
  startTime: number,
  endTime: number
): number {
  const totalWords = transcript.reduce(
    (sum, item) => sum + item.text.split(/\s+/).filter(Boolean).length,
    0
  );
  const durationMinutes = (endTime - startTime) / 60;
  if (durationMinutes <= 0) return 0;
  return Math.round(totalWords / durationMinutes);
}

export function getWPMLabel(wpm: number): string {
  if (wpm < 100) return "ゆっくり";
  if (wpm < 140) return "ふつう";
  return "はやい";
}

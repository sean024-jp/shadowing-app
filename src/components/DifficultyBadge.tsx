import type { Difficulty } from "@/types/models";

const config: Record<Difficulty, { label: string; color: string }> = {
  beginner: { label: "初級", color: "bg-green-600" },
  intermediate: { label: "中級", color: "bg-yellow-600" },
  advanced: { label: "上級", color: "bg-red-600" },
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty | null }) {
  if (!difficulty) return null;
  const { label, color } = config[difficulty];
  return (
    <span className={`${color} text-white text-xs px-2 py-0.5 rounded`}>
      {label}
    </span>
  );
}

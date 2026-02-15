import { supabase } from "@/lib/supabase";

export async function updateStreak(userId: string) {
  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD in local time

  const { data: stats } = await supabase
    .from("user_stats")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!stats) {
    await supabase.from("user_stats").insert({
      user_id: userId,
      current_streak: 1,
      longest_streak: 1,
      last_practice_date: today,
      total_recordings: 1,
    });
    return;
  }

  if (stats.last_practice_date === today) {
    await supabase
      .from("user_stats")
      .update({ total_recordings: stats.total_recordings + 1 })
      .eq("user_id", userId);
    return;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString("sv-SE");

  const newStreak = stats.last_practice_date === yesterdayStr
    ? stats.current_streak + 1
    : 1;

  await supabase
    .from("user_stats")
    .update({
      current_streak: newStreak,
      longest_streak: Math.max(newStreak, stats.longest_streak),
      last_practice_date: today,
      total_recordings: stats.total_recordings + 1,
    })
    .eq("user_id", userId);
}

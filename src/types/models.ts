export type TranscriptItem = {
  text: string;
  offset: number;
  duration: number;
};

export type Material = {
  id: string;
  title: string;
  youtube_id: string;
  youtube_url: string;
  start_time: number;
  end_time: number;
  transcript: TranscriptItem[];
  transcript_ja: TranscriptItem[] | null;
  wpm: number | null;
  description: string | null;
  category: string;
  favorite_count: number;
  created_at: string;
};

export type MaterialRequest = {
  id: string;
  user_id: string;
  youtube_url: string;
  youtube_id: string;
  title: string | null;
  start_time: number;
  end_time: number | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export type UserFavorite = {
  id: string;
  user_id: string;
  material_id: string;
  created_at: string;
};

export type PracticeRecording = {
  id: string;
  user_id: string;
  material_id: string;
  audio_path: string;
  duration_seconds: number | null;
  created_at: string;
};

export type UserStats = {
  id: string;
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_practice_date: string | null;
  total_recordings: number;
  created_at: string;
};

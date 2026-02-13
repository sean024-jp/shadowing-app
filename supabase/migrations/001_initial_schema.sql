-- =============================================================================
-- 001: Initial Schema for Shadowing App
-- Creates all tables, indexes, RLS policies, and storage bucket
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- Tables
-- =============================================================================

-- Materials: Approved learning materials
CREATE TABLE IF NOT EXISTS materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  youtube_url TEXT NOT NULL,
  youtube_id TEXT NOT NULL,
  title TEXT NOT NULL,
  start_time REAL NOT NULL DEFAULT 0,
  end_time REAL NOT NULL DEFAULT 0,
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  transcript_ja JSONB,
  difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  favorite_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Material Requests: User-submitted requests for new materials
CREATE TABLE IF NOT EXISTS material_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  youtube_url TEXT NOT NULL,
  youtube_id TEXT NOT NULL,
  title TEXT,
  difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  start_time REAL NOT NULL DEFAULT 0,
  end_time REAL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Favorites: Many-to-many relationship between users and materials
CREATE TABLE IF NOT EXISTS user_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, material_id)
);

-- Practice History: Records of user practice sessions
CREATE TABLE IF NOT EXISTS practice_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  practiced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Practice Recordings: Audio recordings from practice sessions
CREATE TABLE IF NOT EXISTS practice_recordings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  audio_path TEXT NOT NULL,
  duration_seconds REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, material_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_materials_favorite_count ON materials(favorite_count DESC);
CREATE INDEX IF NOT EXISTS idx_materials_created_at ON materials(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_requests_status ON material_requests(status);
CREATE INDEX IF NOT EXISTS idx_material_requests_user_id ON material_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_material_id ON user_favorites(material_id);
CREATE INDEX IF NOT EXISTS idx_practice_history_user_id ON practice_history(user_id);
CREATE INDEX IF NOT EXISTS idx_practice_history_practiced_at ON practice_history(practiced_at DESC);
CREATE INDEX IF NOT EXISTS idx_practice_recordings_user_id ON practice_recordings(user_id);

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_recordings ENABLE ROW LEVEL SECURITY;

-- Materials: Everyone can read, authenticated users can insert/delete
CREATE POLICY "materials_select_all" ON materials FOR SELECT USING (true);
CREATE POLICY "materials_insert_auth" ON materials FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "materials_delete_auth" ON materials FOR DELETE USING (auth.uid() IS NOT NULL);

-- Material Requests: Users can CRUD their own, anyone authenticated can read all
CREATE POLICY "material_requests_select_auth" ON material_requests FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "material_requests_insert_own" ON material_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "material_requests_update_auth" ON material_requests FOR UPDATE USING (auth.uid() IS NOT NULL);

-- User Favorites: Users can CRUD their own
CREATE POLICY "user_favorites_select_own" ON user_favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_favorites_insert_own" ON user_favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_favorites_delete_own" ON user_favorites FOR DELETE USING (auth.uid() = user_id);

-- Practice History: Users can CRUD their own
CREATE POLICY "practice_history_select_own" ON practice_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "practice_history_insert_own" ON practice_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Practice Recordings: Users can CRUD their own
CREATE POLICY "practice_recordings_select_own" ON practice_recordings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "practice_recordings_insert_own" ON practice_recordings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "practice_recordings_update_own" ON practice_recordings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "practice_recordings_delete_own" ON practice_recordings FOR DELETE USING (auth.uid() = user_id);

-- =============================================================================
-- Storage Bucket
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('practice-recordings', 'practice-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: Users can manage their own recordings
CREATE POLICY "recordings_select_own" ON storage.objects FOR SELECT
  USING (bucket_id = 'practice-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "recordings_insert_own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'practice-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "recordings_update_own" ON storage.objects FOR UPDATE
  USING (bucket_id = 'practice-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "recordings_delete_own" ON storage.objects FOR DELETE
  USING (bucket_id = 'practice-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =============================================================================
-- Function: Auto-update favorite_count on user_favorites changes
-- =============================================================================

CREATE OR REPLACE FUNCTION update_favorite_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE materials SET favorite_count = favorite_count + 1 WHERE id = NEW.material_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE materials SET favorite_count = favorite_count - 1 WHERE id = OLD.material_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trigger_update_favorite_count
  AFTER INSERT OR DELETE ON user_favorites
  FOR EACH ROW EXECUTE FUNCTION update_favorite_count();

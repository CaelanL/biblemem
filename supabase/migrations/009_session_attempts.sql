-- Session attempts table for analytics
-- Tracks every session completion for streaks, accuracy trends, and practice time

CREATE TABLE session_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- Verse info (stored directly, no FK - attempts persist even if verse deleted)
  book TEXT NOT NULL,
  chapter INT NOT NULL,
  verse_start INT NOT NULL,
  verse_end INT NOT NULL,
  version TEXT NOT NULL,

  -- Session info
  difficulty TEXT NOT NULL,                    -- easy/medium/hard
  chunk_size INT NOT NULL,                     -- verses per chunk
  accuracy DECIMAL NOT NULL,                   -- final score (0-100)
  recording_duration_ms INT,                   -- total recording time across all chunks

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_session_attempts_user_date ON session_attempts(user_id, created_at DESC);
CREATE INDEX idx_session_attempts_user_difficulty ON session_attempts(user_id, difficulty, created_at DESC);
CREATE INDEX idx_session_attempts_verse ON session_attempts(user_id, book, chapter, verse_start, verse_end);

-- RLS policies
ALTER TABLE session_attempts ENABLE ROW LEVEL SECURITY;

-- Users can only see their own attempts
CREATE POLICY "Users can view own attempts"
  ON session_attempts FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own attempts
CREATE POLICY "Users can insert own attempts"
  ON session_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

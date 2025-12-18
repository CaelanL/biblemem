-- ============================================================================
-- Bible Memorization App - Initial Schema
-- ============================================================================

-- Usage tracking (metering for free/paid tiers)
CREATE TABLE usage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Transcription: track seconds (cost-aware metering)
  transcribe_seconds INT NOT NULL DEFAULT 0,

  -- Evaluation: count-based (predictable cost per call)
  evaluate_count INT NOT NULL DEFAULT 0,

  -- Bible fetches: count-based (negligible cost)
  bible_fetch_count INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, date)
);

-- Index for fast lookups
CREATE INDEX idx_usage_daily_user_date ON usage_daily(user_id, date);

-- RLS: users can only see their own usage
ALTER TABLE usage_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage" ON usage_daily
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage usage" ON usage_daily
  FOR ALL USING (auth.role() = 'service_role');


-- ============================================================================
-- Transcription concurrency locks (prevent double-tap spam)
-- ============================================================================

CREATE TABLE transcription_locks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: only service role manages locks
ALTER TABLE transcription_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage locks" ON transcription_locks
  FOR ALL USING (auth.role() = 'service_role');

-- Cleanup function for stale locks (> 5 minutes)
CREATE OR REPLACE FUNCTION cleanup_stale_transcription_locks()
RETURNS void
LANGUAGE SQL
AS $$
  DELETE FROM transcription_locks
  WHERE started_at < NOW() - INTERVAL '5 minutes';
$$;


-- ============================================================================
-- Subscriptions (future: paid tier support)
-- ============================================================================

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'supporter')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage subscriptions" ON subscriptions
  FOR ALL USING (auth.role() = 'service_role');


-- ============================================================================
-- Bible verse cache (short-term, license-compliant)
-- 24-hour expiry to respect ESV/NLT redistribution terms
-- ============================================================================

CREATE TABLE verse_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL,           -- e.g., "John 3:16"
  version TEXT NOT NULL,             -- "ESV" or "NLT"
  text TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',

  UNIQUE(reference, version)
);

-- Index for cache lookups and cleanup
CREATE INDEX idx_verse_cache_lookup ON verse_cache(reference, version, expires_at);
CREATE INDEX idx_verse_cache_expires ON verse_cache(expires_at);

-- No RLS on cache - it's shared across all users
-- This is a server-side optimization, not user data

-- Cleanup function for expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_verse_cache()
RETURNS void
LANGUAGE SQL
AS $$
  DELETE FROM verse_cache WHERE expires_at < NOW();
$$;


-- ============================================================================
-- Storage bucket for audio uploads
-- Run this after migration via Dashboard or CLI:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', false);
-- ============================================================================

-- Storage policies (apply via Dashboard after creating bucket)
-- Policy 1: Users can upload to their own folder
-- Policy 2: Service role can read/delete all files

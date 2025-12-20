-- Chapter cache table for storing entire chapters
CREATE TABLE IF NOT EXISTS chapter_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reference text NOT NULL,
  version text NOT NULL,
  verses jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE(reference, version)
);

-- Index for cache lookups
CREATE INDEX IF NOT EXISTS chapter_cache_lookup_idx ON chapter_cache(reference, version, expires_at);

-- Index for cleanup of expired entries
CREATE INDEX IF NOT EXISTS chapter_cache_expires_idx ON chapter_cache(expires_at);

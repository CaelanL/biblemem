-- ============================================================================
-- User Data Tables (verses, collections, progress)
-- ============================================================================

-- ============================================================================
-- User Collections
-- ============================================================================

CREATE TABLE user_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Client-generated ID for sync (matches local AsyncStorage ID)
  client_id TEXT NOT NULL,

  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,

  -- Soft delete for sync reliability
  deleted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each user can only have one collection with a given client_id
  UNIQUE(user_id, client_id)
);

-- Indexes
CREATE INDEX idx_user_collections_user ON user_collections(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_collections_client ON user_collections(user_id, client_id);

-- RLS
ALTER TABLE user_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own collections" ON user_collections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own collections" ON user_collections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own collections" ON user_collections
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage collections" ON user_collections
  FOR ALL USING (auth.role() = 'service_role');


-- ============================================================================
-- User Verses
-- ============================================================================

CREATE TABLE user_verses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES user_collections(id) ON DELETE CASCADE,

  -- Client-generated ID for sync
  client_id TEXT NOT NULL,

  -- Verse data
  book TEXT NOT NULL,
  chapter INT NOT NULL,
  verse_start INT NOT NULL,
  verse_end INT NOT NULL,
  text TEXT NOT NULL,
  version TEXT NOT NULL CHECK (version IN ('ESV', 'NLT')),

  -- Progress tracking (JSONB for flexibility)
  progress JSONB NOT NULL DEFAULT '{
    "easy": {"bestAccuracy": null, "completed": false},
    "medium": {"bestAccuracy": null, "completed": false},
    "hard": {"bestAccuracy": null, "completed": false}
  }'::jsonb,

  -- Soft delete
  deleted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, client_id)
);

-- Indexes
CREATE INDEX idx_user_verses_user ON user_verses(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_verses_collection ON user_verses(collection_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_verses_client ON user_verses(user_id, client_id);

-- RLS
ALTER TABLE user_verses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own verses" ON user_verses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own verses" ON user_verses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own verses" ON user_verses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage verses" ON user_verses
  FOR ALL USING (auth.role() = 'service_role');


-- ============================================================================
-- Auto-update updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_collections_updated_at
  BEFORE UPDATE ON user_collections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_verses_updated_at
  BEFORE UPDATE ON user_verses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

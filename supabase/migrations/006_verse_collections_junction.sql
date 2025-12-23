-- ============================================================================
-- Many-to-Many: Verses ↔ Collections
--
-- Allows same verse to exist in multiple collections without duplicating rows.
-- One verse = one row in user_verses, linked to many collections via this table.
-- ============================================================================

-- ============================================================================
-- Step 1: Create junction table
-- ============================================================================

CREATE TABLE verse_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verse_id UUID NOT NULL REFERENCES user_verses(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES user_collections(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent same verse in same collection twice
  UNIQUE(verse_id, collection_id)
);

-- Indexes for fast lookups
CREATE INDEX idx_verse_collections_verse ON verse_collections(verse_id);
CREATE INDEX idx_verse_collections_collection ON verse_collections(collection_id);

-- RLS - inherit from parent tables (verse owner = collection owner)
ALTER TABLE verse_collections ENABLE ROW LEVEL SECURITY;

-- Users can view junction entries for their own verses
CREATE POLICY "Users can view own verse_collections" ON verse_collections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_verses
      WHERE user_verses.id = verse_collections.verse_id
      AND user_verses.user_id = auth.uid()
    )
  );

-- Users can insert junction entries for their own verses
CREATE POLICY "Users can insert own verse_collections" ON verse_collections
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_verses
      WHERE user_verses.id = verse_collections.verse_id
      AND user_verses.user_id = auth.uid()
    )
  );

-- Users can delete junction entries for their own verses
CREATE POLICY "Users can delete own verse_collections" ON verse_collections
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_verses
      WHERE user_verses.id = verse_collections.verse_id
      AND user_verses.user_id = auth.uid()
    )
  );

-- Service role can manage all
CREATE POLICY "Service role can manage verse_collections" ON verse_collections
  FOR ALL USING (auth.role() = 'service_role');


-- ============================================================================
-- Step 2: Migrate existing data
-- ============================================================================

-- Copy existing collection relationships to junction table
INSERT INTO verse_collections (verse_id, collection_id, added_at)
SELECT id, collection_id, created_at
FROM user_verses
WHERE collection_id IS NOT NULL;


-- ============================================================================
-- Step 3: Remove collection_id from user_verses
-- ============================================================================

-- Drop the foreign key constraint first
ALTER TABLE user_verses DROP CONSTRAINT IF EXISTS user_verses_collection_id_fkey;

-- Drop the index that references collection_id
DROP INDEX IF EXISTS idx_user_verses_collection;

-- Remove the column
ALTER TABLE user_verses DROP COLUMN collection_id;


-- ============================================================================
-- Step 4: Add unique constraint for verse identity
-- ============================================================================

-- A verse is unique by (user, book, chapter, verse range, version)
-- This prevents duplicate verses for the same user
CREATE UNIQUE INDEX idx_user_verses_unique_verse
ON user_verses(user_id, book, chapter, verse_start, verse_end, version)
WHERE deleted_at IS NULL;

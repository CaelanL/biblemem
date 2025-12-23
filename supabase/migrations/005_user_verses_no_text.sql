-- ============================================================================
-- Remove text column from user_verses
--
-- Verse text should ONLY live in verse_cache (500 per version limit).
-- user_verses stores references only, no text.
-- This enforces ESV/NLT licensing requirements.
-- ============================================================================

-- Drop the text column if it exists
ALTER TABLE user_verses DROP COLUMN IF EXISTS text;

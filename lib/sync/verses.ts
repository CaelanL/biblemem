/**
 * Verse Sync Layer
 *
 * Since storage now writes directly to Supabase, these are thin wrappers.
 * Kept for API compatibility with existing code.
 */

import {
  saveVerse,
  deleteVerse,
  updateVerseProgress,
  getSavedVerses,
  type SavedVerse,
  type BibleVersion,
  type Difficulty,
} from '@/lib/storage';

/**
 * Save a verse (writes directly to Supabase)
 */
export async function syncSaveVerse(
  verse: Omit<SavedVerse, 'id' | 'createdAt' | 'progress' | 'collectionId' | 'version'>,
  collectionId: string = 'my-verses',
  version: BibleVersion = 'ESV'
): Promise<SavedVerse> {
  return saveVerse(verse, collectionId, version);
}

/**
 * Delete a verse (soft delete in Supabase)
 */
export async function syncDeleteVerse(id: string): Promise<void> {
  return deleteVerse(id);
}

/**
 * Update verse progress (writes directly to Supabase)
 */
export async function syncUpdateProgress(
  id: string,
  difficulty: Difficulty,
  accuracy: number
): Promise<void> {
  return updateVerseProgress(id, difficulty, accuracy);
}

/**
 * Fetch all verses from server
 * @deprecated Use getSavedVerses() from storage directly
 */
export async function fetchVersesFromServer(): Promise<SavedVerse[]> {
  return getSavedVerses();
}

import { supabase } from '@/lib/api/client';
import { ensureAuth } from '@/lib/api';
import {
  getSavedVerses as getLocalVerses,
  saveVerse as saveLocalVerse,
  deleteVerse as deleteLocalVerse,
  updateVerseProgress as updateLocalProgress,
  type SavedVerse,
  type BibleVersion,
  type Difficulty,
} from '@/lib/storage';
import { syncEnsureCollection } from './collections';

const DEFAULT_COLLECTION_ID = 'my-verses';

async function getCurrentUserId(): Promise<string> {
  await ensureAuth();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

interface DbVerse {
  id: string;
  user_id: string;
  collection_id: string;
  client_id: string;
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  text: string;
  version: string;
  progress: {
    easy: { bestAccuracy: number | null; completed: boolean };
    medium: { bestAccuracy: number | null; completed: boolean };
    hard: { bestAccuracy: number | null; completed: boolean };
  };
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Save a verse locally and sync to server
 */
export async function syncSaveVerse(
  verse: Omit<SavedVerse, 'id' | 'createdAt' | 'progress' | 'collectionId' | 'version'>,
  collectionId: string = DEFAULT_COLLECTION_ID,
  version: BibleVersion = 'ESV'
): Promise<SavedVerse> {
  // 1. Save locally first (optimistic)
  const local = await saveLocalVerse(verse, collectionId, version);

  // 2. Sync to server
  try {
    const userId = await getCurrentUserId();

    // Ensure collection exists on server (creates it if needed)
    const serverCollectionId = await syncEnsureCollection(collectionId);

    const { error } = await supabase.from('user_verses').insert({
      user_id: userId,
      client_id: local.id,
      collection_id: serverCollectionId,
      book: local.book,
      chapter: local.chapter,
      verse_start: local.verseStart,
      verse_end: local.verseEnd,
      text: local.text,
      version: local.version,
      progress: local.progress,
      created_at: new Date(local.createdAt).toISOString(),
    });

    if (error) {
      console.error('[SYNC] Failed to sync verse:', error);
    }
  } catch (e) {
    console.error('[SYNC] Verse sync error:', e);
  }

  return local;
}

/**
 * Delete a verse (soft delete on server, hard delete locally)
 */
export async function syncDeleteVerse(id: string): Promise<void> {
  // 1. Soft delete on server
  try {
    const { error } = await supabase
      .from('user_verses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('client_id', id);

    if (error) {
      console.error('[SYNC] Failed to delete verse on server:', error);
    }
  } catch (e) {
    console.error('[SYNC] Verse delete sync error:', e);
  }

  // 2. Delete locally
  await deleteLocalVerse(id);
}

/**
 * Update verse progress locally and sync to server
 */
export async function syncUpdateProgress(
  id: string,
  difficulty: Difficulty,
  accuracy: number
): Promise<void> {
  // 1. Update locally first
  await updateLocalProgress(id, difficulty, accuracy);

  // 2. Get updated verse to sync full progress object
  const verses = await getLocalVerses();
  const verse = verses.find((v) => v.id === id);

  if (!verse) return;

  // 3. Sync to server
  try {
    const { error } = await supabase
      .from('user_verses')
      .update({ progress: verse.progress })
      .eq('client_id', id);

    if (error) {
      console.error('[SYNC] Failed to sync progress:', error);
    }
  } catch (e) {
    console.error('[SYNC] Progress sync error:', e);
  }
}

/**
 * Fetch all verses from server
 */
export async function fetchVersesFromServer(): Promise<SavedVerse[]> {
  const { data, error } = await supabase
    .from('user_verses')
    .select(`
      *,
      user_collections!inner(client_id)
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[SYNC] Failed to fetch verses:', error);
    return [];
  }

  return (data as (DbVerse & { user_collections: { client_id: string } })[]).map((v) => ({
    id: v.client_id,
    collectionId: v.user_collections.client_id,
    book: v.book,
    chapter: v.chapter,
    verseStart: v.verse_start,
    verseEnd: v.verse_end,
    text: v.text,
    version: v.version as BibleVersion,
    createdAt: new Date(v.created_at).getTime(),
    progress: v.progress,
  }));
}

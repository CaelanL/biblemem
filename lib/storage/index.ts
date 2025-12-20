/**
 * Storage Layer
 *
 * Supabase is the source of truth. No AsyncStorage for user data.
 * All reads/writes go directly to the server.
 */

import { supabase } from '@/lib/api/client';
import { ensureAuth } from '@/lib/api';

// ============ TYPES ============

export interface DifficultyProgress {
  bestAccuracy: number | null;
  completed: boolean; // true if bestAccuracy >= 90
}

export interface VerseProgress {
  easy: DifficultyProgress;
  medium: DifficultyProgress;
  hard: DifficultyProgress;
}

export type BibleVersion = 'ESV' | 'NLT';

export interface SavedVerse {
  id: string;
  collectionId: string;
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  text?: string; // Optional - fetched on demand from verse_cache
  version: BibleVersion;
  createdAt: number;
  progress: VerseProgress;
}

export interface Collection {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: number;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

// ============ CONSTANTS ============

const DEFAULT_COLLECTION_ID = 'my-verses';

const DEFAULT_PROGRESS: VerseProgress = {
  easy: { bestAccuracy: null, completed: false },
  medium: { bestAccuracy: null, completed: false },
  hard: { bestAccuracy: null, completed: false },
};

const DEFAULT_COLLECTION: Collection = {
  id: DEFAULT_COLLECTION_ID,
  name: 'My Verses',
  isDefault: true,
  createdAt: 0,
};

// ============ HELPERS ============

async function getCurrentUserId(): Promise<string> {
  await ensureAuth();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

// ============ COLLECTION FUNCTIONS ============

/**
 * Get all collections from Supabase
 */
export async function getCollections(): Promise<Collection[]> {
  try {
    const { data, error } = await supabase
      .from('user_collections')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[STORAGE] Failed to fetch collections:', error);
      return [DEFAULT_COLLECTION];
    }

    const collections = data.map((c) => ({
      id: c.client_id,
      name: c.name,
      isDefault: c.is_default,
      createdAt: new Date(c.created_at).getTime(),
    }));

    // Ensure default collection always exists
    const hasDefault = collections.some((c) => c.isDefault);
    if (!hasDefault) {
      collections.unshift(DEFAULT_COLLECTION);
    }

    return collections;
  } catch (e) {
    console.error('[STORAGE] Collection fetch error:', e);
    return [DEFAULT_COLLECTION];
  }
}

/**
 * Create a collection in Supabase
 */
export async function createCollection(name: string): Promise<Collection> {
  const userId = await getCurrentUserId();
  const clientId = `collection-${Date.now()}`;
  const createdAt = new Date();

  const { error } = await supabase.from('user_collections').insert({
    user_id: userId,
    client_id: clientId,
    name,
    is_default: false,
    created_at: createdAt.toISOString(),
  });

  if (error) {
    console.error('[STORAGE] Failed to create collection:', error);
    throw new Error('Failed to create collection');
  }

  return {
    id: clientId,
    name,
    isDefault: false,
    createdAt: createdAt.getTime(),
  };
}

/**
 * Delete a collection (soft delete) and move verses to default
 */
export async function deleteCollection(id: string): Promise<void> {
  if (id === DEFAULT_COLLECTION_ID) return;

  // Get server UUID for this collection
  const { data: collection } = await supabase
    .from('user_collections')
    .select('id')
    .eq('client_id', id)
    .is('deleted_at', null)
    .single();

  if (!collection) return;

  // Soft-delete the collection
  await supabase
    .from('user_collections')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', collection.id);

  // Get default collection server ID
  const { data: defaultCollection } = await supabase
    .from('user_collections')
    .select('id')
    .eq('client_id', DEFAULT_COLLECTION_ID)
    .is('deleted_at', null)
    .single();

  if (defaultCollection) {
    // Move verses to default collection (not delete them)
    await supabase
      .from('user_verses')
      .update({ collection_id: defaultCollection.id })
      .eq('collection_id', collection.id)
      .is('deleted_at', null);
  }
}

/**
 * Get verse count for a collection
 */
export async function getCollectionVerseCount(collectionId: string): Promise<number> {
  const { data: collection } = await supabase
    .from('user_collections')
    .select('id')
    .eq('client_id', collectionId)
    .is('deleted_at', null)
    .single();

  if (!collection) return 0;

  const { count, error } = await supabase
    .from('user_verses')
    .select('*', { count: 'exact', head: true })
    .eq('collection_id', collection.id)
    .is('deleted_at', null);

  if (error) {
    console.error('[STORAGE] Failed to count verses:', error);
    return 0;
  }

  return count || 0;
}

// ============ VERSE FUNCTIONS ============

/**
 * Get all saved verses from Supabase
 */
export async function getSavedVerses(): Promise<SavedVerse[]> {
  try {
    const { data, error } = await supabase
      .from('user_verses')
      .select(`
        *,
        user_collections!inner(client_id)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[STORAGE] Failed to fetch verses:', error);
      return [];
    }

    return data.map((v) => ({
      id: v.client_id,
      collectionId: v.user_collections.client_id,
      book: v.book,
      chapter: v.chapter,
      verseStart: v.verse_start,
      verseEnd: v.verse_end,
      version: v.version as BibleVersion,
      createdAt: new Date(v.created_at).getTime(),
      progress: v.progress || DEFAULT_PROGRESS,
    }));
  } catch (e) {
    console.error('[STORAGE] Verse fetch error:', e);
    return [];
  }
}

/**
 * Get verses for a specific collection
 */
export async function getVersesByCollection(collectionId: string): Promise<SavedVerse[]> {
  try {
    const { data: collection } = await supabase
      .from('user_collections')
      .select('id')
      .eq('client_id', collectionId)
      .is('deleted_at', null)
      .single();

    if (!collection) return [];

    const { data, error } = await supabase
      .from('user_verses')
      .select('*')
      .eq('collection_id', collection.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[STORAGE] Failed to fetch verses:', error);
      return [];
    }

    return data.map((v) => ({
      id: v.client_id,
      collectionId: collectionId,
      book: v.book,
      chapter: v.chapter,
      verseStart: v.verse_start,
      verseEnd: v.verse_end,
      version: v.version as BibleVersion,
      createdAt: new Date(v.created_at).getTime(),
      progress: v.progress || DEFAULT_PROGRESS,
    }));
  } catch (e) {
    console.error('[STORAGE] Verse fetch error:', e);
    return [];
  }
}

/**
 * Save a verse to Supabase
 */
export async function saveVerse(
  verse: Omit<SavedVerse, 'id' | 'createdAt' | 'progress' | 'collectionId' | 'version'>,
  collectionId: string = DEFAULT_COLLECTION_ID,
  version: BibleVersion = 'ESV'
): Promise<SavedVerse> {
  const userId = await getCurrentUserId();
  const clientId = `${verse.book}-${verse.chapter}-${verse.verseStart}-${verse.verseEnd}-${Date.now()}`;
  const createdAt = new Date();

  // Get server collection ID
  let serverCollectionId: string;
  const { data: collection } = await supabase
    .from('user_collections')
    .select('id')
    .eq('client_id', collectionId)
    .is('deleted_at', null)
    .single();

  if (collection) {
    serverCollectionId = collection.id;
  } else {
    // Ensure default collection exists
    const { data: defaultColl, error: defaultError } = await supabase
      .from('user_collections')
      .select('id')
      .eq('client_id', DEFAULT_COLLECTION_ID)
      .is('deleted_at', null)
      .single();

    if (defaultColl) {
      serverCollectionId = defaultColl.id;
    } else {
      // Create default collection
      const { data: newDefault, error: createError } = await supabase
        .from('user_collections')
        .insert({
          user_id: userId,
          client_id: DEFAULT_COLLECTION_ID,
          name: 'My Verses',
          is_default: true,
          created_at: new Date(0).toISOString(),
        })
        .select('id')
        .single();

      if (createError || !newDefault) {
        throw new Error('Failed to create default collection');
      }
      serverCollectionId = newDefault.id;
    }
  }

  const { error } = await supabase.from('user_verses').insert({
    user_id: userId,
    client_id: clientId,
    collection_id: serverCollectionId,
    book: verse.book,
    chapter: verse.chapter,
    verse_start: verse.verseStart,
    verse_end: verse.verseEnd,
    version,
    progress: DEFAULT_PROGRESS,
    created_at: createdAt.toISOString(),
  });

  if (error) {
    console.error('[STORAGE] Failed to save verse:', error);
    throw new Error('Failed to save verse');
  }

  return {
    id: clientId,
    collectionId,
    book: verse.book,
    chapter: verse.chapter,
    verseStart: verse.verseStart,
    verseEnd: verse.verseEnd,
    version,
    createdAt: createdAt.getTime(),
    progress: DEFAULT_PROGRESS,
  };
}

/**
 * Delete a verse (soft delete)
 */
export async function deleteVerse(id: string): Promise<void> {
  const { error } = await supabase
    .from('user_verses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('client_id', id);

  if (error) {
    console.error('[STORAGE] Failed to delete verse:', error);
  }
}

/**
 * Update verse progress
 */
export async function updateVerseProgress(
  id: string,
  difficulty: Difficulty,
  accuracy: number
): Promise<void> {
  // Get current progress
  const { data: verse, error: fetchError } = await supabase
    .from('user_verses')
    .select('progress')
    .eq('client_id', id)
    .single();

  if (fetchError || !verse) {
    console.error('[STORAGE] Failed to fetch verse progress:', fetchError);
    return;
  }

  const currentProgress = verse.progress || DEFAULT_PROGRESS;
  const currentBest = currentProgress[difficulty]?.bestAccuracy;

  // Only update if this is a new best score
  if (currentBest === null || accuracy > currentBest) {
    const newProgress = {
      ...currentProgress,
      [difficulty]: {
        bestAccuracy: accuracy,
        completed: accuracy >= 90,
      },
    };

    const { error: updateError } = await supabase
      .from('user_verses')
      .update({ progress: newProgress })
      .eq('client_id', id);

    if (updateError) {
      console.error('[STORAGE] Failed to update progress:', updateError);
    }
  }
}

// ============ UTILITY FUNCTIONS ============

export function formatVerseReference(verse: SavedVerse): string {
  if (verse.verseStart === verse.verseEnd) {
    return `${verse.book} ${verse.chapter}:${verse.verseStart}`;
  }
  return `${verse.book} ${verse.chapter}:${verse.verseStart}-${verse.verseEnd}`;
}

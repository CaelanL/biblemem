/**
 * Zustand Store for User Data
 *
 * Centralized state management for collections and verses.
 * Data is fetched from Supabase and cached in memory.
 * Components subscribe and auto-update when data changes.
 */

import { create } from 'zustand';
import { supabase } from '@/lib/api/client';
import { ensureAuth } from '@/lib/api';
import type { Collection, SavedVerse, BibleVersion, Difficulty } from '@/lib/storage';

// ============ CONSTANTS ============

const DEFAULT_COLLECTION_ID = 'my-verses';

const DEFAULT_PROGRESS = {
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

// ============ STORE INTERFACE ============

interface AppState {
  // Data
  collections: Collection[];
  verses: SavedVerse[];

  // Loading states
  hydrated: boolean;
  collectionsLoading: boolean;
  versesLoading: boolean;

  // Error state
  error: string | null;

  // Actions - Fetch
  fetchCollections: () => Promise<boolean>;
  fetchVerses: () => Promise<boolean>;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;

  // Actions - Collections
  addCollection: (name: string) => Promise<Collection>;
  deleteCollection: (id: string) => Promise<void>;

  // Actions - Verses
  addVerse: (
    verse: Omit<SavedVerse, 'id' | 'createdAt' | 'progress' | 'collectionId' | 'version'>,
    collectionId: string,
    version: BibleVersion
  ) => Promise<SavedVerse>;
  deleteVerse: (id: string) => Promise<void>;
  updateVerseProgress: (id: string, difficulty: Difficulty, accuracy: number) => Promise<void>;

  // Reset
  clear: () => void;
}

// ============ HELPERS ============

async function getCurrentUserId(): Promise<string> {
  await ensureAuth();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

// ============ STORE ============

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  collections: [],
  verses: [],
  hydrated: false,
  collectionsLoading: true,
  versesLoading: true,
  error: null,

  // ============ FETCH ACTIONS ============

  fetchCollections: async () => {
    set({ collectionsLoading: true });
    try {
      const { data, error } = await supabase
        .from('user_collections')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[STORE] Failed to fetch collections:', error);
        // Keep existing state, set error
        set({ collectionsLoading: false, error: 'Failed to load collections' });
        return false;
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

      set({ collections, collectionsLoading: false, error: null });
      return true;
    } catch (e) {
      console.error('[STORE] Collection fetch error:', e);
      // Keep existing state, set error
      set({ collectionsLoading: false, error: 'Failed to load collections' });
      return false;
    }
  },

  fetchVerses: async () => {
    set({ versesLoading: true });
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
        console.error('[STORE] Failed to fetch verses:', error);
        // Keep existing state, set error
        set({ versesLoading: false, error: 'Failed to load verses' });
        return false;
      }

      const verses = data.map((v) => ({
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

      set({ verses, versesLoading: false, error: null });
      return true;
    } catch (e) {
      console.error('[STORE] Verse fetch error:', e);
      // Keep existing state, set error
      set({ versesLoading: false, error: 'Failed to load verses' });
      return false;
    }
  },

  hydrate: async () => {
    console.log('[STORE] Hydrating...');
    const [collectionsOk, versesOk] = await Promise.all([
      get().fetchCollections(),
      get().fetchVerses(),
    ]);
    // Only mark as hydrated if both fetches succeeded
    if (collectionsOk && versesOk) {
      set({ hydrated: true, error: null });
      console.log('[STORE] Hydrated successfully');
    } else {
      console.log('[STORE] Hydration failed - data may be stale');
    }
  },

  refresh: async () => {
    set({ error: null });
    await Promise.all([get().fetchCollections(), get().fetchVerses()]);
  },

  clearError: () => {
    set({ error: null });
  },

  // ============ COLLECTION ACTIONS ============

  addCollection: async (name: string) => {
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
      console.error('[STORE] Failed to create collection:', error);
      throw new Error('Failed to create collection');
    }

    const newCollection: Collection = {
      id: clientId,
      name,
      isDefault: false,
      createdAt: createdAt.getTime(),
    };

    // Optimistically add to store
    set((state) => ({
      collections: [...state.collections, newCollection],
    }));

    return newCollection;
  },

  deleteCollection: async (id: string) => {
    if (id === DEFAULT_COLLECTION_ID) return;

    // Get server UUID for this collection
    const { data: collection, error: collectionError } = await supabase
      .from('user_collections')
      .select('id')
      .eq('client_id', id)
      .is('deleted_at', null)
      .single();

    if (collectionError || !collection) {
      console.error('[STORE] Collection not found for deletion:', id);
      throw new Error('Collection not found');
    }

    // Get default collection server ID FIRST (before deleting)
    const { data: defaultCollection, error: defaultError } = await supabase
      .from('user_collections')
      .select('id')
      .eq('client_id', DEFAULT_COLLECTION_ID)
      .is('deleted_at', null)
      .single();

    if (defaultError || !defaultCollection) {
      console.error('[STORE] Default collection not found, cannot reassign verses');
      throw new Error('Cannot delete collection: default collection not found');
    }

    // Soft-delete the collection
    const { error: deleteError } = await supabase
      .from('user_collections')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', collection.id);

    if (deleteError) {
      console.error('[STORE] Failed to delete collection:', deleteError);
      throw new Error('Failed to delete collection');
    }

    // Move verses to default collection on server
    const { error: moveError } = await supabase
      .from('user_verses')
      .update({ collection_id: defaultCollection.id })
      .eq('collection_id', collection.id)
      .is('deleted_at', null);

    if (moveError) {
      console.error('[STORE] Failed to move verses to default collection:', moveError);
      // Collection is already deleted, but verses weren't moved - this is a problem
      // Refresh to get correct server state
      get().refresh();
      throw new Error('Collection deleted but failed to move verses');
    }

    // Update local state
    set((state) => ({
      collections: state.collections.filter((c) => c.id !== id),
      verses: state.verses.map((v) =>
        v.collectionId === id ? { ...v, collectionId: DEFAULT_COLLECTION_ID } : v
      ),
    }));
  },

  // ============ VERSE ACTIONS ============

  addVerse: async (verse, collectionId, version) => {
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
      const { data: defaultColl } = await supabase
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
      console.error('[STORE] Failed to save verse:', error);
      throw new Error('Failed to save verse');
    }

    const newVerse: SavedVerse = {
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

    // Optimistically add to store
    set((state) => ({
      verses: [newVerse, ...state.verses],
    }));

    return newVerse;
  },

  deleteVerse: async (id: string) => {
    const { error } = await supabase
      .from('user_verses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('client_id', id);

    if (error) {
      console.error('[STORE] Failed to delete verse:', error);
      return;
    }

    // Optimistically remove from store
    set((state) => ({
      verses: state.verses.filter((v) => v.id !== id),
    }));
  },

  updateVerseProgress: async (id: string, difficulty: Difficulty, accuracy: number) => {
    // Get current verse from store
    const verse = get().verses.find((v) => v.id === id);
    if (!verse) return;

    const currentBest = verse.progress[difficulty]?.bestAccuracy;

    // Only update if this is a new best score
    if (currentBest === null || accuracy > currentBest) {
      const newProgress = {
        ...verse.progress,
        [difficulty]: {
          bestAccuracy: accuracy,
          completed: accuracy >= 90,
        },
      };

      // Update on server
      const { error } = await supabase
        .from('user_verses')
        .update({ progress: newProgress })
        .eq('client_id', id);

      if (error) {
        console.error('[STORE] Failed to update progress:', error);
        return;
      }

      // Update in store
      set((state) => ({
        verses: state.verses.map((v) =>
          v.id === id ? { ...v, progress: newProgress } : v
        ),
      }));
    }
  },

  // ============ RESET ============

  clear: () => {
    set({
      collections: [],
      verses: [],
      hydrated: false,
      collectionsLoading: true,
      versesLoading: true,
      error: null,
    });
  },
}));

// ============ SELECTORS ============

import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';

export const useCollections = () => useAppStore((state) => state.collections);
export const useVerses = () => useAppStore((state) => state.verses);
export const useHydrated = () => useAppStore((state) => state.hydrated);
export const useStoreError = () => useAppStore((state) => state.error);

export function useVersesByCollection(collectionId: string) {
  const verses = useAppStore((state) => state.verses, shallow);
  return useMemo(
    () => verses.filter((v) => v.collectionId === collectionId),
    [verses, collectionId]
  );
}

export function useCollectionVerseCount(collectionId: string) {
  const verses = useAppStore((state) => state.verses, shallow);
  return useMemo(
    () => verses.filter((v) => v.collectionId === collectionId).length,
    [verses, collectionId]
  );
}

export function useVerse(id: string) {
  const verses = useAppStore((state) => state.verses, shallow);
  return useMemo(
    () => verses.find((v) => v.id === id),
    [verses, id]
  );
}

export function useCollection(id: string) {
  const collections = useAppStore((state) => state.collections, shallow);
  return useMemo(
    () => collections.find((c) => c.id === id),
    [collections, id]
  );
}

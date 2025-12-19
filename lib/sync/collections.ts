import { supabase } from '@/lib/api/client';
import { ensureAuth } from '@/lib/api';
import {
  getCollections as getLocalCollections,
  createCollection as createLocalCollection,
  deleteCollection as deleteLocalCollection,
  type Collection,
} from '@/lib/storage';

const DEFAULT_COLLECTION_ID = 'my-verses';

async function getCurrentUserId(): Promise<string> {
  await ensureAuth();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

interface DbCollection {
  id: string;
  user_id: string;
  client_id: string;
  name: string;
  is_default: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Create a collection locally and sync to server
 */
export async function syncCreateCollection(name: string): Promise<Collection> {
  // 1. Create locally first (optimistic)
  const local = await createLocalCollection(name);

  // 2. Sync to server
  try {
    const userId = await getCurrentUserId();
    const { error } = await supabase.from('user_collections').insert({
      user_id: userId,
      client_id: local.id,
      name: local.name,
      is_default: local.isDefault,
      created_at: new Date(local.createdAt).toISOString(),
    });

    if (error) {
      console.error('[SYNC] Failed to sync collection:', error);
      // Local save succeeded, server failed - data is safe locally
    }
  } catch (e) {
    console.error('[SYNC] Collection sync error:', e);
  }

  return local;
}

/**
 * Delete a collection (soft delete on server, hard delete locally)
 */
export async function syncDeleteCollection(id: string): Promise<void> {
  // Don't allow deleting default collection
  if (id === DEFAULT_COLLECTION_ID) return;

  // 1. Soft delete on server first
  try {
    // Get the server UUID for this collection
    const serverCollectionId = await getServerCollectionId(id);

    if (serverCollectionId) {
      // Soft-delete the collection
      const { error } = await supabase
        .from('user_collections')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', serverCollectionId);

      if (error) {
        console.error('[SYNC] Failed to delete collection on server:', error);
      }

      // Soft-delete verses in this collection using server UUID
      const { error: versesError } = await supabase
        .from('user_verses')
        .update({ deleted_at: new Date().toISOString() })
        .eq('collection_id', serverCollectionId);

      if (versesError) {
        console.error('[SYNC] Failed to delete verses in collection:', versesError);
      }
    }
  } catch (e) {
    console.error('[SYNC] Collection delete sync error:', e);
  }

  // 2. Delete locally (this also moves verses to default collection)
  await deleteLocalCollection(id);
}

/**
 * Ensure default collection exists on server
 */
export async function syncEnsureDefaultCollection(): Promise<string> {
  const userId = await getCurrentUserId();

  // Check if default collection exists on server
  const { data: existing } = await supabase
    .from('user_collections')
    .select('id')
    .eq('client_id', DEFAULT_COLLECTION_ID)
    .is('deleted_at', null)
    .single();

  if (existing) {
    return existing.id;
  }

  // Create default collection on server
  const { data: created, error } = await supabase
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

  if (error) {
    console.error('[SYNC] Failed to create default collection:', error);
    throw error;
  }

  return created.id;
}

/**
 * Get server UUID for a collection by its client ID
 */
export async function getServerCollectionId(clientId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_collections')
    .select('id')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .single();

  if (error || !data) {
    return null;
  }

  return data.id;
}

/**
 * Ensure a collection exists on server, creating it if necessary
 * Returns the server UUID for the collection
 */
export async function syncEnsureCollection(clientId: string): Promise<string> {
  // Check if collection already exists on server
  const existingId = await getServerCollectionId(clientId);
  if (existingId) {
    return existingId;
  }

  // If it's the default collection, use the dedicated function
  if (clientId === DEFAULT_COLLECTION_ID) {
    return syncEnsureDefaultCollection();
  }

  // Get local collection data
  const localCollections = await getLocalCollections();
  const localCollection = localCollections.find((c) => c.id === clientId);

  if (!localCollection) {
    // Collection doesn't exist locally either, fall back to default
    console.warn(`[SYNC] Collection ${clientId} not found locally, using default`);
    return syncEnsureDefaultCollection();
  }

  // Create collection on server
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('user_collections')
    .insert({
      user_id: userId,
      client_id: localCollection.id,
      name: localCollection.name,
      is_default: localCollection.isDefault,
      created_at: new Date(localCollection.createdAt).toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[SYNC] Failed to create collection on server:', error);
    // Fall back to default collection
    return syncEnsureDefaultCollection();
  }

  return data.id;
}

/**
 * Fetch all collections from server
 */
export async function fetchCollectionsFromServer(): Promise<Collection[]> {
  const { data, error } = await supabase
    .from('user_collections')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[SYNC] Failed to fetch collections:', error);
    return [];
  }

  return (data as DbCollection[]).map((c) => ({
    id: c.client_id,
    name: c.name,
    isDefault: c.is_default,
    createdAt: new Date(c.created_at).getTime(),
  }));
}

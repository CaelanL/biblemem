/**
 * Collection Sync Layer
 *
 * Since storage now writes directly to Supabase, these are thin wrappers.
 * Kept for API compatibility with existing code.
 */

import { supabase } from '@/lib/api/client';
import { ensureAuth } from '@/lib/api';
import {
  getCollections,
  createCollection,
  deleteCollection,
  type Collection,
} from '@/lib/storage';

const DEFAULT_COLLECTION_ID = 'my-verses';

async function getCurrentUserId(): Promise<string> {
  await ensureAuth();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

/**
 * Create a collection (writes directly to Supabase)
 */
export async function syncCreateCollection(name: string): Promise<Collection> {
  return createCollection(name);
}

/**
 * Delete a collection (soft delete in Supabase)
 */
export async function syncDeleteCollection(id: string): Promise<void> {
  return deleteCollection(id);
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

  // Collection doesn't exist - fall back to default
  console.warn(`[SYNC] Collection ${clientId} not found, using default`);
  return syncEnsureDefaultCollection();
}

/**
 * Fetch all collections from server
 * @deprecated Use getCollections() from storage directly
 */
export async function fetchCollectionsFromServer(): Promise<Collection[]> {
  return getCollections();
}

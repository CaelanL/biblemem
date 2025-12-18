import AsyncStorage from '@react-native-async-storage/async-storage';

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
  collectionId: string; // which collection this verse belongs to
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  text: string;
  version: BibleVersion; // which translation this verse was saved in
  createdAt: number;
  progress: VerseProgress;
}

export interface Collection {
  id: string;
  name: string;
  isDefault: boolean; // "My Verses" can't be deleted
  createdAt: number;
}

const VERSES_KEY = 'saved_verses';
const COLLECTIONS_KEY = 'collections';
const DEFAULT_COLLECTION_ID = 'my-verses';

const DEFAULT_PROGRESS: VerseProgress = {
  easy: { bestAccuracy: null, completed: false },
  medium: { bestAccuracy: null, completed: false },
  hard: { bestAccuracy: null, completed: false },
};

// ============ COLLECTION FUNCTIONS ============

const DEFAULT_COLLECTION: Collection = {
  id: DEFAULT_COLLECTION_ID,
  name: 'My Verses',
  isDefault: true,
  createdAt: 0,
};

export async function getCollections(): Promise<Collection[]> {
  try {
    const data = await AsyncStorage.getItem(COLLECTIONS_KEY);
    const collections = data ? JSON.parse(data) : [];
    // Ensure default collection always exists
    const hasDefault = collections.some((c: Collection) => c.isDefault);
    if (!hasDefault) {
      collections.unshift(DEFAULT_COLLECTION);
    }
    return collections;
  } catch {
    return [DEFAULT_COLLECTION];
  }
}

export async function createCollection(name: string): Promise<Collection> {
  const collections = await getCollections();

  const newCollection: Collection = {
    id: `collection-${Date.now()}`,
    name,
    isDefault: false,
    createdAt: Date.now(),
  };

  collections.push(newCollection);
  await AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));

  return newCollection;
}

export async function deleteCollection(id: string): Promise<void> {
  const collections = await getCollections();
  const collection = collections.find((c) => c.id === id);

  // Can't delete the default collection
  if (collection?.isDefault) return;

  const filtered = collections.filter((c) => c.id !== id);
  await AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(filtered));

  // Move verses from deleted collection to default
  const verses = await getSavedVerses();
  const updated = verses.map((v) =>
    v.collectionId === id ? { ...v, collectionId: DEFAULT_COLLECTION_ID } : v
  );
  await AsyncStorage.setItem(VERSES_KEY, JSON.stringify(updated));
}

export async function getCollectionVerseCount(collectionId: string): Promise<number> {
  const verses = await getSavedVerses();
  return verses.filter((v) => v.collectionId === collectionId).length;
}

// ============ VERSE FUNCTIONS ============

export async function getSavedVerses(): Promise<SavedVerse[]> {
  try {
    const data = await AsyncStorage.getItem(VERSES_KEY);
    const verses = data ? JSON.parse(data) : [];
    // Migrate old verses without progress, collectionId, or version
    return verses.map((v: SavedVerse) => ({
      ...v,
      progress: v.progress ?? DEFAULT_PROGRESS,
      collectionId: v.collectionId ?? DEFAULT_COLLECTION_ID,
      version: v.version ?? 'ESV', // Default old verses to ESV
    }));
  } catch {
    return [];
  }
}

export async function getVersesByCollection(collectionId: string): Promise<SavedVerse[]> {
  const verses = await getSavedVerses();
  return verses.filter((v) => v.collectionId === collectionId);
}

export async function saveVerse(
  verse: Omit<SavedVerse, 'id' | 'createdAt' | 'progress' | 'collectionId' | 'version'>,
  collectionId: string = DEFAULT_COLLECTION_ID,
  version: BibleVersion = 'ESV'
): Promise<SavedVerse> {
  const verses = await getSavedVerses();

  const newVerse: SavedVerse = {
    ...verse,
    collectionId,
    version,
    id: `${verse.book}-${verse.chapter}-${verse.verseStart}-${verse.verseEnd}-${Date.now()}`,
    createdAt: Date.now(),
    progress: DEFAULT_PROGRESS,
  };

  verses.push(newVerse);
  await AsyncStorage.setItem(VERSES_KEY, JSON.stringify(verses));

  return newVerse;
}

export async function deleteVerse(id: string): Promise<void> {
  const verses = await getSavedVerses();
  const filtered = verses.filter((v) => v.id !== id);
  await AsyncStorage.setItem(VERSES_KEY, JSON.stringify(filtered));
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export async function updateVerseProgress(
  id: string,
  difficulty: Difficulty,
  accuracy: number
): Promise<void> {
  const verses = await getSavedVerses();
  const verseIndex = verses.findIndex((v) => v.id === id);

  if (verseIndex === -1) return;

  const verse = verses[verseIndex];
  const currentBest = verse.progress[difficulty].bestAccuracy;

  // Only update if this is a new best score
  if (currentBest === null || accuracy > currentBest) {
    verse.progress[difficulty] = {
      bestAccuracy: accuracy,
      completed: accuracy >= 90,
    };
    await AsyncStorage.setItem(VERSES_KEY, JSON.stringify(verses));
  }
}

export async function clearAllVerses(): Promise<void> {
  await AsyncStorage.removeItem(VERSES_KEY);
}

export function formatVerseReference(verse: SavedVerse): string {
  if (verse.verseStart === verse.verseEnd) {
    return `${verse.book} ${verse.chapter}:${verse.verseStart}`;
  }
  return `${verse.book} ${verse.chapter}:${verse.verseStart}-${verse.verseEnd}`;
}

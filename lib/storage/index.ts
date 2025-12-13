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

export interface SavedVerse {
  id: string;
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  text: string;
  createdAt: number;
  progress: VerseProgress;
}

const VERSES_KEY = 'saved_verses';

const DEFAULT_PROGRESS: VerseProgress = {
  easy: { bestAccuracy: null, completed: false },
  medium: { bestAccuracy: null, completed: false },
  hard: { bestAccuracy: null, completed: false },
};

export async function getSavedVerses(): Promise<SavedVerse[]> {
  try {
    const data = await AsyncStorage.getItem(VERSES_KEY);
    const verses = data ? JSON.parse(data) : [];
    // Migrate old verses without progress
    return verses.map((v: SavedVerse) => ({
      ...v,
      progress: v.progress ?? DEFAULT_PROGRESS,
    }));
  } catch {
    return [];
  }
}

export async function saveVerse(verse: Omit<SavedVerse, 'id' | 'createdAt' | 'progress'>): Promise<SavedVerse> {
  const verses = await getSavedVerses();

  const newVerse: SavedVerse = {
    ...verse,
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

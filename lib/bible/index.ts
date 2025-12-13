import { BOOK_ALIASES, Verse, VerseRef } from './types';
import bibleData from '@/assets/bible/esv.json';

type BibleData = Record<string, Record<string, Record<string, string>>>;
const bible = bibleData as BibleData;

/**
 * Normalize book name to match JSON keys
 */
export function normalizeBookName(book: string): string {
  const lower = book.toLowerCase().trim();

  // Check aliases first
  if (BOOK_ALIASES[lower]) {
    return BOOK_ALIASES[lower];
  }

  // Try to find exact match (case-insensitive)
  const books = Object.keys(bible);
  const match = books.find((b) => b.toLowerCase() === lower);
  if (match) {
    return match;
  }

  // Try partial match (for things like "John" matching "John")
  const partialMatch = books.find((b) => b.toLowerCase().startsWith(lower));
  if (partialMatch) {
    return partialMatch;
  }

  // Return original with title case as fallback
  return book.charAt(0).toUpperCase() + book.slice(1);
}

/**
 * Get a single verse
 */
export function getVerse(ref: VerseRef): Verse | null {
  const bookName = normalizeBookName(ref.book);
  const chapter = String(ref.chapter);
  const verse = String(ref.verse);

  const text = bible[bookName]?.[chapter]?.[verse];

  if (!text) {
    return null;
  }

  return {
    reference: { ...ref, book: bookName },
    text,
  };
}

/**
 * Get a range of verses (e.g., John 3:16-18)
 */
export function getVerseRange(ref: VerseRef): Verse | null {
  const bookName = normalizeBookName(ref.book);
  const chapter = String(ref.chapter);
  const startVerse = ref.verse;
  const endVerse = ref.verseEnd ?? ref.verse;

  const texts: string[] = [];

  for (let v = startVerse; v <= endVerse; v++) {
    const text = bible[bookName]?.[chapter]?.[String(v)];
    if (text) {
      texts.push(text);
    }
  }

  if (texts.length === 0) {
    return null;
  }

  return {
    reference: { ...ref, book: bookName },
    text: texts.join(' '),
  };
}

/**
 * Parse a reference string like "John 3:16" or "Psalm 23:1-6"
 */
export function parseReference(refString: string): VerseRef | null {
  // Match patterns like "John 3:16", "1 John 1:9", "Psalm 23:1-6"
  const match = refString.match(
    /^(\d?\s?[a-zA-Z\s]+?)\s*(\d+):(\d+)(?:-(\d+))?$/
  );

  if (!match) {
    return null;
  }

  const [, book, chapter, verse, verseEnd] = match;

  return {
    book: book.trim(),
    chapter: parseInt(chapter, 10),
    verse: parseInt(verse, 10),
    verseEnd: verseEnd ? parseInt(verseEnd, 10) : undefined,
  };
}

/**
 * Get verse(s) from a reference string
 */
export function getVerseFromString(refString: string): Verse | null {
  const ref = parseReference(refString);
  if (!ref) {
    return null;
  }

  return ref.verseEnd ? getVerseRange(ref) : getVerse(ref);
}

/**
 * Format a reference for display
 */
export function formatReference(ref: VerseRef): string {
  const base = `${ref.book} ${ref.chapter}:${ref.verse}`;
  return ref.verseEnd ? `${base}-${ref.verseEnd}` : base;
}

/**
 * Get all book names
 */
export function getBooks(): string[] {
  return Object.keys(bible);
}

/**
 * Get chapter count for a book
 */
export function getChapterCount(book: string): number {
  const bookName = normalizeBookName(book);
  const chapters = bible[bookName];
  return chapters ? Object.keys(chapters).length : 0;
}

/**
 * Get verse count for a chapter
 */
export function getVerseCount(book: string, chapter: number): number {
  const bookName = normalizeBookName(book);
  const verses = bible[bookName]?.[String(chapter)];
  return verses ? Object.keys(verses).length : 0;
}

export * from './types';

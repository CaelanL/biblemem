import { BOOK_ALIASES, VerseRef } from './types';
import structureData from '@/assets/bible/structure.json';

interface BookStructure {
  abbr: string;
  book: string;
  chapters: number[]; // Array of verse counts per chapter
}

const structure = structureData as BookStructure[];

// Build lookup maps for fast access
const bookByName: Record<string, BookStructure> = {};
const bookByAbbr: Record<string, BookStructure> = {};
for (const book of structure) {
  bookByName[book.book.toLowerCase()] = book;
  bookByAbbr[book.abbr.toLowerCase()] = book;
}

/**
 * Normalize book name to canonical form
 */
export function normalizeBookName(book: string): string {
  const lower = book.toLowerCase().trim();

  // Check aliases first
  if (BOOK_ALIASES[lower]) {
    return BOOK_ALIASES[lower];
  }

  // Try exact match by book name
  if (bookByName[lower]) {
    return bookByName[lower].book;
  }

  // Try by abbreviation
  if (bookByAbbr[lower]) {
    return bookByAbbr[lower].book;
  }

  // Try partial match
  const partialMatch = structure.find((b) => b.book.toLowerCase().startsWith(lower));
  if (partialMatch) {
    return partialMatch.book;
  }

  // Return original with title case as fallback
  return book.charAt(0).toUpperCase() + book.slice(1);
}

/**
 * Get book structure by name
 */
function getBookStructure(book: string): BookStructure | null {
  const bookName = normalizeBookName(book);
  return bookByName[bookName.toLowerCase()] ?? null;
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
  return structure.map((b) => b.book);
}

/**
 * Get chapter count for a book
 */
export function getChapterCount(book: string): number {
  const bookStruct = getBookStructure(book);
  return bookStruct?.chapters.length ?? 0;
}

/**
 * Get verse count for a chapter
 */
export function getVerseCount(book: string, chapter: number): number {
  const bookStruct = getBookStructure(book);
  if (!bookStruct || chapter < 1 || chapter > bookStruct.chapters.length) {
    return 0;
  }
  return bookStruct.chapters[chapter - 1]; // chapters array is 0-indexed
}

export * from './types';

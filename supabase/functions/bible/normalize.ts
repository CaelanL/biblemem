/**
 * Reference Normalization
 *
 * Single source of truth for normalizing Bible references.
 * All variations → canonical format for consistent caching.
 */

/**
 * Book name aliases for normalization
 * All variations → canonical name
 */
export const BOOK_ALIASES: Record<string, string> = {
  // Genesis
  gen: "Genesis",
  genesis: "Genesis",
  // Exodus
  ex: "Exodus",
  exod: "Exodus",
  exodus: "Exodus",
  // Leviticus
  lev: "Leviticus",
  leviticus: "Leviticus",
  // Numbers
  num: "Numbers",
  numbers: "Numbers",
  // Deuteronomy
  deut: "Deuteronomy",
  deuteronomy: "Deuteronomy",
  // Joshua
  josh: "Joshua",
  joshua: "Joshua",
  // Judges
  judg: "Judges",
  judges: "Judges",
  // Ruth
  ruth: "Ruth",
  // 1 Samuel
  "1 sam": "1 Samuel",
  "1 samuel": "1 Samuel",
  "1sam": "1 Samuel",
  // 2 Samuel
  "2 sam": "2 Samuel",
  "2 samuel": "2 Samuel",
  "2sam": "2 Samuel",
  // 1 Kings
  "1 kings": "1 Kings",
  "1 kgs": "1 Kings",
  "1kings": "1 Kings",
  // 2 Kings
  "2 kings": "2 Kings",
  "2 kgs": "2 Kings",
  "2kings": "2 Kings",
  // 1 Chronicles
  "1 chron": "1 Chronicles",
  "1 chronicles": "1 Chronicles",
  "1chron": "1 Chronicles",
  // 2 Chronicles
  "2 chron": "2 Chronicles",
  "2 chronicles": "2 Chronicles",
  "2chron": "2 Chronicles",
  // Ezra
  ezra: "Ezra",
  // Nehemiah
  neh: "Nehemiah",
  nehemiah: "Nehemiah",
  // Esther
  esth: "Esther",
  esther: "Esther",
  // Job
  job: "Job",
  // Psalms
  ps: "Psalms",
  psa: "Psalms",
  psalm: "Psalms",
  psalms: "Psalms",
  // Proverbs
  prov: "Proverbs",
  proverbs: "Proverbs",
  // Ecclesiastes
  eccl: "Ecclesiastes",
  ecclesiastes: "Ecclesiastes",
  // Song of Solomon
  song: "Song of Solomon",
  "song of solomon": "Song of Solomon",
  "song of songs": "Song of Solomon",
  sos: "Song of Solomon",
  // Isaiah
  isa: "Isaiah",
  isaiah: "Isaiah",
  // Jeremiah
  jer: "Jeremiah",
  jeremiah: "Jeremiah",
  // Lamentations
  lam: "Lamentations",
  lamentations: "Lamentations",
  // Ezekiel
  ezek: "Ezekiel",
  ezekiel: "Ezekiel",
  // Daniel
  dan: "Daniel",
  daniel: "Daniel",
  // Hosea
  hos: "Hosea",
  hosea: "Hosea",
  // Joel
  joel: "Joel",
  // Amos
  amos: "Amos",
  // Obadiah
  obad: "Obadiah",
  obadiah: "Obadiah",
  // Jonah
  jonah: "Jonah",
  // Micah
  mic: "Micah",
  micah: "Micah",
  // Nahum
  nah: "Nahum",
  nahum: "Nahum",
  // Habakkuk
  hab: "Habakkuk",
  habakkuk: "Habakkuk",
  // Zephaniah
  zeph: "Zephaniah",
  zephaniah: "Zephaniah",
  // Haggai
  hag: "Haggai",
  haggai: "Haggai",
  // Zechariah
  zech: "Zechariah",
  zechariah: "Zechariah",
  // Malachi
  mal: "Malachi",
  malachi: "Malachi",
  // Matthew
  matt: "Matthew",
  matthew: "Matthew",
  // Mark
  mk: "Mark",
  mark: "Mark",
  // Luke
  lk: "Luke",
  luke: "Luke",
  // John
  jn: "John",
  john: "John",
  // Acts
  acts: "Acts",
  // Romans
  rom: "Romans",
  romans: "Romans",
  // 1 Corinthians
  "1 cor": "1 Corinthians",
  "1 corinthians": "1 Corinthians",
  "1cor": "1 Corinthians",
  // 2 Corinthians
  "2 cor": "2 Corinthians",
  "2 corinthians": "2 Corinthians",
  "2cor": "2 Corinthians",
  // Galatians
  gal: "Galatians",
  galatians: "Galatians",
  // Ephesians
  eph: "Ephesians",
  ephesians: "Ephesians",
  // Philippians
  phil: "Philippians",
  philippians: "Philippians",
  // Colossians
  col: "Colossians",
  colossians: "Colossians",
  // 1 Thessalonians
  "1 thess": "1 Thessalonians",
  "1 thessalonians": "1 Thessalonians",
  "1thess": "1 Thessalonians",
  // 2 Thessalonians
  "2 thess": "2 Thessalonians",
  "2 thessalonians": "2 Thessalonians",
  "2thess": "2 Thessalonians",
  // 1 Timothy
  "1 tim": "1 Timothy",
  "1 timothy": "1 Timothy",
  "1tim": "1 Timothy",
  // 2 Timothy
  "2 tim": "2 Timothy",
  "2 timothy": "2 Timothy",
  "2tim": "2 Timothy",
  // Titus
  titus: "Titus",
  // Philemon
  phlm: "Philemon",
  philemon: "Philemon",
  // Hebrews
  heb: "Hebrews",
  hebrews: "Hebrews",
  // James
  jas: "James",
  james: "James",
  // 1 Peter
  "1 pet": "1 Peter",
  "1 peter": "1 Peter",
  "1pet": "1 Peter",
  // 2 Peter
  "2 pet": "2 Peter",
  "2 peter": "2 Peter",
  "2pet": "2 Peter",
  // 1 John
  "1 jn": "1 John",
  "1 john": "1 John",
  "1jn": "1 John",
  // 2 John
  "2 jn": "2 John",
  "2 john": "2 John",
  "2jn": "2 John",
  // 3 John
  "3 jn": "3 John",
  "3 john": "3 John",
  "3jn": "3 John",
  // Jude
  jude: "Jude",
  // Revelation
  rev: "Revelation",
  revelation: "Revelation",
};

/**
 * Normalize a reference to canonical form
 * "Jn 3:16" → "John 3:16"
 * "1 sam 13" → "1 Samuel 13"
 * "PSALM 23:1-6" → "Psalms 23:1-6"
 */
export function normalizeReference(ref: string): string {
  // Match: Book Chapter:Verse(-EndVerse)? or Book Chapter (chapter only)
  const match = ref.match(
    /^(\d?\s?[a-zA-Z\s]+?)\s*(\d+)(?::(\d+)(?:-(\d+))?)?$/
  );

  if (!match) {
    return ref; // Can't parse, return as-is
  }

  const [, bookPart, chapter, verse, verseEnd] = match;
  const bookLower = bookPart.trim().toLowerCase();

  // Look up canonical book name
  const canonicalBook = BOOK_ALIASES[bookLower] || bookPart.trim();

  // Build normalized reference
  let result = `${canonicalBook} ${chapter}`;
  if (verse) {
    result += `:${verse}`;
    if (verseEnd) {
      result += `-${verseEnd}`;
    }
  }

  return result;
}

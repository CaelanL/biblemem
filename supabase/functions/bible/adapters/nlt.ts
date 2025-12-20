/**
 * NLT API Adapter
 *
 * Handles fetching from the Tyndale NLT API.
 * Returns HTML that needs parsing.
 * Supports multiple versions: NLT, KJV, NTV, NLTUK
 */

import { BibleAdapter, VerseResult, ChapterResult } from "./types.ts";
import { findMissingVerses } from "../verse-counts.ts";

const NLT_API_KEY = Deno.env.get("NLT_API_KEY");
const NLT_API_BASE = "https://api.nlt.to/api/passages";

/**
 * NLT API book name mapping
 * Canonical name → NLT API format (no spaces in numbered books)
 */
const NLT_BOOKS: Record<string, string> = {
  Genesis: "Gen",
  Exodus: "Exod",
  Leviticus: "Lev",
  Numbers: "Num",
  Deuteronomy: "Deut",
  Joshua: "Josh",
  Judges: "Judg",
  Ruth: "Ruth",
  "1 Samuel": "1Sam",
  "2 Samuel": "2Sam",
  "1 Kings": "1Kgs",
  "2 Kings": "2Kgs",
  "1 Chronicles": "1Chr",
  "2 Chronicles": "2Chr",
  Ezra: "Ezra",
  Nehemiah: "Neh",
  Esther: "Esth",
  Job: "Job",
  Psalms: "Ps",
  Proverbs: "Prov",
  Ecclesiastes: "Eccl",
  "Song of Solomon": "Song",
  Isaiah: "Isa",
  Jeremiah: "Jer",
  Lamentations: "Lam",
  Ezekiel: "Ezek",
  Daniel: "Dan",
  Hosea: "Hos",
  Joel: "Joel",
  Amos: "Amos",
  Obadiah: "Obad",
  Jonah: "Jonah",
  Micah: "Mic",
  Nahum: "Nah",
  Habakkuk: "Hab",
  Zephaniah: "Zeph",
  Haggai: "Hag",
  Zechariah: "Zech",
  Malachi: "Mal",
  Matthew: "Matt",
  Mark: "Mark",
  Luke: "Luke",
  John: "John",
  Acts: "Acts",
  Romans: "Rom",
  "1 Corinthians": "1Cor",
  "2 Corinthians": "2Cor",
  Galatians: "Gal",
  Ephesians: "Eph",
  Philippians: "Phil",
  Colossians: "Col",
  "1 Thessalonians": "1Thess",
  "2 Thessalonians": "2Thess",
  "1 Timothy": "1Tim",
  "2 Timothy": "2Tim",
  Titus: "Titus",
  Philemon: "Phlm",
  Hebrews: "Heb",
  James: "Jas",
  "1 Peter": "1Pet",
  "2 Peter": "2Pet",
  "1 John": "1John",
  "2 John": "2John",
  "3 John": "3John",
  Jude: "Jude",
  Revelation: "Rev",
};

/**
 * Convert normalized reference to NLT API format
 * "1 Samuel 13" → "1Sam.13"
 * "John 3:16-18" → "John.3.16-18"
 */
function toNLTRef(ref: string): string {
  const match = ref.match(/^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);
  if (!match) return ref;

  const [, book, chapter, verse, verseEnd] = match;
  const nltBook = NLT_BOOKS[book] || book.replace(/\s+/g, "");

  let result = `${nltBook}.${chapter}`;
  if (verse) {
    result += `.${verse}`;
    if (verseEnd) result += `-${verseEnd}`;
  }
  return result;
}

/**
 * Clean HTML entities and tags from text
 */
function cleanText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&#\d+;/g, "")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse NLT HTML chapter response
 * Extracts verses from <span class="vn">X</span> markers
 */
function parseChapter(
  html: string,
  expectedCount: number
): Record<string, string> {
  const verses: Record<string, string> = {};

  // Extract body content
  let content = html;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) content = bodyMatch[1];

  // Strip non-verse content
  content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  content = content.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
  content = content.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  content = content.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  content = content.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, "");

  // Remove section headings (various NLT heading classes)
  content = content.replace(
    /<span[^>]*class="[^"]*heading[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
    ""
  );
  content = content.replace(
    /<span[^>]*class="[^"]*head[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
    ""
  );
  content = content.replace(
    /<div[^>]*class="[^"]*heading[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  content = content.replace(
    /<p[^>]*class="[^"]*heading[^"]*"[^>]*>[\s\S]*?<\/p>/gi,
    ""
  );
  content = content.replace(
    /<p[^>]*class="[^"]*section[^"]*"[^>]*>[\s\S]*?<\/p>/gi,
    ""
  );

  // Remove chapter:verse references (e.g., "5:1" at start of sections)
  content = content.replace(
    /<span[^>]*class="[^"]*cv[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
    ""
  );
  content = content.replace(
    /<span[^>]*class="[^"]*ref[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
    ""
  );

  // Remove footnotes
  content = content.replace(
    /<span[^>]*class="[^"]*ft[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
    ""
  );
  content = content.replace(
    /<a[^>]*class="[^"]*fn[^"]*"[^>]*>[\s\S]*?<\/a>/gi,
    ""
  );
  content = content.replace(/[*†‡§]\d*/g, "");

  // Find verse markers
  const vnPattern = /<span[^>]*class="[^"]*vn[^"]*"[^>]*>(\d+)<\/span>/gi;
  const matches: { verseNum: string; endIndex: number }[] = [];
  let match;

  while ((match = vnPattern.exec(content)) !== null) {
    matches.push({ verseNum: match[1], endIndex: match.index + match[0].length });
  }

  // Extract text between markers
  for (let i = 0; i < matches.length; i++) {
    const { verseNum, endIndex } = matches[i];

    // Find where the next verse marker starts
    const nextMarkerMatch = content
      .substring(endIndex)
      .match(/<span[^>]*class="[^"]*vn[^"]*"[^>]*>/i);
    const verseHtml = nextMarkerMatch
      ? content.substring(endIndex, endIndex + nextMarkerMatch.index!)
      : content.substring(endIndex);

    // Clean the HTML to get plain text
    let verseText = cleanText(verseHtml);

    // Remove stray chapter:verse refs and copyright
    verseText = verseText
      .replace(/^\d+:\d+\s*/g, "")
      .replace(/\s+\d+:\d+\s*/g, " ")
      .replace(/Holy Bible,?\s*New Living Translation.*/i, "")
      .replace(/NLT\.to.*/i, "")
      .replace(/Tyndale House.*/i, "")
      .replace(/Copyright.*/i, "")
      .trim();

    if (verseText) {
      verses[verseNum] = verseText;
    }
  }

  // Strict validation
  const actualCount = Object.keys(verses).length;
  if (actualCount === 0) {
    console.error("=== NLT PARSE FAILURE ===");
    console.error("No verses found. Raw HTML (first 3000 chars):");
    console.error(html.substring(0, 3000));
    throw new Error("NLT parsing failed: no verses extracted");
  }

  if (actualCount !== expectedCount && expectedCount > 0) {
    console.warn(`=== NLT VERSE COUNT MISMATCH ===`);
    console.warn(`Expected: ${expectedCount}, Got: ${actualCount}`);
    console.warn(`Missing: ${findMissingVerses(verses, expectedCount)}`);
  }

  return verses;
}

/**
 * Parse single verse from NLT HTML
 */
function parseVerseHTML(html: string): string {
  let content = html;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) content = bodyMatch[1];

  // Strip everything except text
  content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  content = content.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
  content = content.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  content = content.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  content = content.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, "");

  // Remove verse numbers
  content = content.replace(
    /<span[^>]*class="[^"]*vn[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
    ""
  );

  // Remove headings
  content = content.replace(
    /<span[^>]*class="[^"]*heading[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
    ""
  );
  content = content.replace(
    /<span[^>]*class="[^"]*head[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
    ""
  );

  // Remove footnotes
  content = content.replace(
    /<span[^>]*class="[^"]*ft[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
    ""
  );

  // Clean
  content = cleanText(content);

  // Remove copyright
  content = content
    .replace(/Holy Bible,?\s*New Living Translation.*/i, "")
    .replace(/NLT\.to.*/i, "")
    .replace(/Tyndale House.*/i, "")
    .replace(/Copyright.*/i, "")
    .trim();

  if (!content) {
    throw new Error("Could not parse NLT verse");
  }

  return content;
}

export const nltAdapter: BibleAdapter = {
  id: "nlt-api",
  name: "Tyndale NLT API",
  supportedVersions: ["NLT", "KJV", "NTV", "NLTUK"],

  async fetchVerse(ref: string, version: string): Promise<VerseResult> {
    if (!NLT_API_KEY) {
      throw new Error("NLT_API_KEY not configured");
    }

    const nltRef = toNLTRef(ref);
    console.log(`NLT fetchVerse: "${ref}" → "${nltRef}" (${version})`);

    const response = await fetch(
      `${NLT_API_BASE}?ref=${encodeURIComponent(nltRef)}&version=${version}&key=${NLT_API_KEY}`
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("NLT API error:", error);
      throw new Error(`NLT API error: ${response.status}`);
    }

    const html = await response.text();
    return { text: parseVerseHTML(html) };
  },

  async fetchChapter(
    ref: string,
    version: string,
    expectedVerseCount: number
  ): Promise<ChapterResult> {
    if (!NLT_API_KEY) {
      throw new Error("NLT_API_KEY not configured");
    }

    const nltRef = toNLTRef(ref);
    console.log(`NLT fetchChapter: "${ref}" → "${nltRef}" (${version})`);

    const response = await fetch(
      `${NLT_API_BASE}?ref=${encodeURIComponent(nltRef)}&version=${version}&key=${NLT_API_KEY}`
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("NLT API error:", error);
      throw new Error(`NLT API error: ${response.status}`);
    }

    const html = await response.text();
    return { verses: parseChapter(html, expectedVerseCount) };
  },
};

import { getAuthToken, getSupabaseUrl } from "./client";

export type BibleVersion = "ESV" | "NLT";

export interface BibleVerse {
  reference: string;
  version: BibleVersion;
  text: string;
  cached: boolean;
}

/**
 * Fetch a verse from the Bible API
 *
 * @param reference - Verse reference (e.g., "John 3:16", "Psalm 23:1-6")
 * @param version - Bible version ("ESV" or "NLT")
 * @returns The verse text and metadata
 */
export async function fetchVerse(
  reference: string,
  version: BibleVersion = "ESV"
): Promise<BibleVerse> {
  const token = await getAuthToken();
  const baseUrl = getSupabaseUrl();

  const params = new URLSearchParams({
    ref: reference,
    version,
  });

  const response = await fetch(`${baseUrl}/functions/v1/bible?${params}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));

    if (response.status === 429) {
      throw new Error(
        `Daily limit reached. Resets at ${error.resetsAt || "midnight UTC"}`
      );
    }

    throw new Error(error.error || "Failed to fetch verse");
  }

  return response.json();
}

/**
 * Fetch multiple verses (convenience wrapper)
 */
export async function fetchVerses(
  references: string[],
  version: BibleVersion = "ESV"
): Promise<BibleVerse[]> {
  return Promise.all(references.map((ref) => fetchVerse(ref, version)));
}

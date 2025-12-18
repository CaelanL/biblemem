import { getAuthToken, getSupabaseUrl } from "./client";
import { alignTranscription } from "../align";
import type { AlignmentWord } from "../study-chunks";

export interface EvaluationResult {
  cleanedTranscription: string;
  alignment: AlignmentWord[];
}

/**
 * Evaluate a recitation attempt
 *
 * Flow:
 * 1. Send transcription to backend for LLM cleaning
 * 2. Perform alignment locally (no API needed)
 * 3. Return cleaned transcription + alignment
 *
 * @param actualVerse - The correct verse text
 * @param transcription - Raw transcription from speech-to-text
 * @returns Cleaned transcription and word-by-word alignment
 */
export async function evaluateRecitation(
  actualVerse: string,
  transcription: string
): Promise<EvaluationResult> {
  const token = await getAuthToken();
  const baseUrl = getSupabaseUrl();

  // Step 1: Clean transcription with LLM (backend)
  const response = await fetch(`${baseUrl}/functions/v1/evaluate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      actualVerse,
      transcription,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));

    if (response.status === 429) {
      throw new Error(
        `Daily limit reached. Resets at ${error.resetsAt || "midnight UTC"}`
      );
    }

    throw new Error(error.error || "Evaluation failed");
  }

  const { cleanedTranscription } = await response.json();

  // Step 2: Align locally (no API call needed)
  const alignment = alignTranscription(actualVerse, cleanedTranscription);

  return {
    cleanedTranscription,
    alignment,
  };
}

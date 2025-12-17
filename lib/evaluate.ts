import { alignTranscription } from './align';
import type { AlignmentWord } from './study-chunks';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

// Set to true to use mock data for testing UI
const USE_MOCK = false;

export type { AlignmentWord };

export interface EvaluationResult {
  cleanedTranscription: string;
  alignment: AlignmentWord[];
}

/**
 * Clean transcription using LLM to remove stutters, fillers, false starts.
 * Returns the cleaned text only - alignment is done algorithmically.
 */
async function cleanTranscription(
  actualVerse: string,
  rawTranscription: string
): Promise<string> {
  if (!OPENAI_API_KEY) {
    // Fallback: return as-is if no API key
    return rawTranscription;
  }

  const prompt = `Clean this speech-to-text transcription of a Bible verse recitation.

ACTUAL VERSE (for context on intentional repetition):
${actualVerse}

RAW TRANSCRIPTION:
${rawTranscription}

CLEANING RULES:
- Remove stutters ("the the the" → "the")
- Remove filler words (um, uh, er, like, you know)
- Remove false starts/restarts ("For God so lov- For God so loved" → "For God so loved")
- Remove self-corrections ("wait no", "I mean", "sorry")
- KEEP intentional repetition that matches the actual verse (like "holy, holy, holy")
- KEEP their word choices even if wrong - don't correct to match the actual verse

Return ONLY the cleaned transcription text. No explanations, no quotes, no labels.`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        input: [
          {
            role: 'user',
            content: [{ type: 'input_text', text: prompt }],
          },
        ],
        max_output_tokens: 500,
        reasoning: { effort: 'minimal' },
      }),
    });

    if (!response.ok) {
      console.error('LLM cleaning failed, using raw transcription');
      return rawTranscription;
    }

    const apiResult = await response.json();

    // Responses API returns output[].content[].text
    const outputContent =
      apiResult.output?.[0]?.content?.find((c: any) => c.type === 'output_text')?.text?.trim();
    const content = outputContent || rawTranscription;
    return content;
  } catch (error) {
    console.error('LLM cleaning error:', error);
    return rawTranscription;
  }
}

/**
 * Evaluate a recitation attempt against the actual verse.
 * 1. Clean transcription with LLM (remove stutters, fillers)
 * 2. Align cleaned transcription with verse algorithmically
 */
export async function evaluateRecitation(
  actualVerse: string,
  transcription: string
): Promise<EvaluationResult> {
  console.log('=== evaluateRecitation ===');
  console.log('actualVerse:', actualVerse);
  console.log('raw transcription:', transcription);

  // Step 1: Clean transcription with LLM
  const cleanedTranscription = USE_MOCK
    ? transcription  // Skip LLM in mock mode
    : await cleanTranscription(actualVerse, transcription);

  console.log('cleaned transcription:', cleanedTranscription);

  // Step 2: Align algorithmically
  const alignment = alignTranscription(actualVerse, cleanedTranscription);

  console.log('alignment:', JSON.stringify(alignment, null, 2));
  console.log('==========================');

  return { cleanedTranscription, alignment };
}

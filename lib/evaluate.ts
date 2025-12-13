const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

export interface AlignmentWord {
  word: string;
  status: 'correct' | 'close' | 'wrong' | 'added' | 'missing';
  expected?: string; // For 'close', 'wrong', or 'missing' status, shows what was expected
}

export interface EvaluationResult {
  cleanedTranscription: string;
  result: 'good' | 'bad';
  alignment: AlignmentWord[];
}

export async function evaluateRecitation(
  actualVerse: string,
  transcription: string
): Promise<EvaluationResult> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const prompt = `You are evaluating a Bible memorization attempt.

ACTUAL VERSE:
${actualVerse}

RAW TRANSCRIPTION (from speech-to-text):
${transcription}

STEP 1 - CLEAN THE TRANSCRIPTION:
Clean up the raw transcription to get what they MEANT to say:
- Remove stutters ("the the the" → "the")
- Remove filler words (um, uh, er, like, you know)
- Remove false starts/restarts ("For God so lov- For God so loved" → "For God so loved")
- Remove self-corrections ("wait no", "I mean", "sorry")
- KEEP intentional repetition that matches the actual verse (like "holy, holy, holy")
- KEEP their word choices even if wrong - don't correct to the actual verse

IMPORTANT: After cleaning, DO NOT change or reinterpret the cleaned transcription in later steps.

STEP 2 - EVALUATE:
Base your decision ONLY on the cleaned transcription, not the raw transcription.
- Default to "good" unless clearly missing major portions or is a different verse
- Minor word mistakes (articles like "the", "a"), small omissions, or synonyms are OK
- Extra words before or after the verse are OK
- Respond "bad" ONLY if large portions are missing, the structure is wrong, or meaning is significantly changed
- Punctuation does not matter

STEP 3 - WORD ALIGNMENT:
Create a left-to-right alignment at the word level, allowing limited multi-word groupings where specified. The goal is to reflect how a human tutor would mark the attempt, not to maximize string similarity.

For each position, output a JSON object with:
- "word": the word(s) the user said (or "___" for missing)
- "status": one of "correct", "close", "wrong", "added", "missing"
- "expected": include for close, wrong, and missing statuses (what the actual verse had)

Statuses:
- correct: exact match (case-insensitive)
- close: synonym, minor variation, or semantically equivalent ("loved" vs "so loved", "God" vs "the Lord")
- wrong: word intended to correspond to a verse word but is incorrect (a substitution)
- added: extra word not in the verse, a pure insertion (before, after, or between)
- missing: word from verse that user skipped (show as "___")

Rules:
- Preserve word order - align left-to-right
- Max 2 words can map together for semantic equivalents
- If a word repeats in the verse, track each occurrence separately
- Ignore punctuation completely - do not include punctuation as separate items in the alignment

RESPOND IN THIS EXACT FORMAT (three lines):
CLEANED: <the cleaned transcription>
RESULT: <good or bad>
ALIGNMENT: <JSON array>

Do not include explanations, comments, or extra text. If you cannot follow the format exactly, still output the format with best effort.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 2000,
      reasoning_effort: 'minimal',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const apiResult = await response.json();

  console.log('=== GPT-5-mini Full API Response ===');
  console.log(JSON.stringify(apiResult, null, 2));
  console.log('====================================');

  // Chat Completions API uses choices[0].message.content
  // Responses API uses output array
  const content = apiResult.choices?.[0]?.message?.content?.trim()
    || apiResult.output?.[0]?.content?.trim()
    || '';

  console.log('=== Parsed content ===');
  console.log(content);
  console.log('=====================');

  // Parse the response
  const cleanedMatch = content.match(/CLEANED:\s*(.+)/i);
  const resultMatch = content.match(/RESULT:\s*(good|bad)/i);
  const alignmentMatch = content.match(/ALIGNMENT:\s*(\[[\s\S]*\])/i);

  const cleanedTranscription = cleanedMatch?.[1]?.trim() || transcription;
  const result = resultMatch?.[1]?.toLowerCase() === 'good' ? 'good' : 'bad';

  let alignment: AlignmentWord[] = [];
  if (alignmentMatch?.[1]) {
    try {
      alignment = JSON.parse(alignmentMatch[1]);
    } catch {
      // If JSON parsing fails, create a simple fallback
      alignment = cleanedTranscription.split(/\s+/).map(word => ({
        word,
        status: 'correct' as const,
      }));
    }
  }

  return { cleanedTranscription, result, alignment };
}

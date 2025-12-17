const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

// Set to true to use mock data for testing UI
const USE_MOCK = true;

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

// Mock function for testing UI
async function mockEvaluateRecitation(): Promise<EvaluationResult> {
  // Simulate 3 second loading
  await new Promise(resolve => setTimeout(resolve, 0));

  return {
    cleanedTranscription: "For God so loved the world that he gave his only begotten Son",
    result: 'good',
    alignment: [
      { word: "For", status: "correct" },
      { word: "God", status: "correct" },
      { word: "so", status: "correct" },
      { word: "loved", status: "correct" },
      { word: "the", status: "correct" },
      { word: "world", status: "correct" },
      { word: "that", status: "correct" },
      { word: "he", status: "correct" },
      { word: "gave", status: "correct" },
      { word: "his", status: "correct" },
      { word: "only", status: "close", expected: "one and only" },
      { word: "begotten", status: "added" },
      { word: "Son", status: "correct" },
      { word: "___", status: "missing", expected: "that" },
      { word: "___", status: "missing", expected: "whoever" },
      { word: "___", status: "missing", expected: "believes" },
    ],
  };
}

export async function evaluateRecitation(
  actualVerse: string,
  transcription: string
): Promise<EvaluationResult> {
  // Use mock for testing UI
  if (USE_MOCK) {
    return mockEvaluateRecitation();
  }

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

STEP 2 - WORD ALIGNMENT:
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
- Ignore puncuation in comparison. "everyone." == "everyone"

RESPOND IN THIS EXACT FORMAT (three lines):
CLEANED: <the cleaned transcription>
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

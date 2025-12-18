import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { getAuthUser } from "../_shared/auth.ts";
import { handleCors } from "../_shared/cors.ts";
import {
  unauthorized,
  badRequest,
  jsonResponse,
  serverError,
} from "../_shared/errors.ts";
import {
  checkAndIncrementEvaluateUsage,
  rateLimitResponse,
} from "../_shared/usage.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Only POST allowed
  if (req.method !== "POST") {
    return badRequest("Method not allowed");
  }

  // Authenticate user
  const user = await getAuthUser(req);
  if (!user) {
    return unauthorized();
  }

  // Check usage
  const usage = await checkAndIncrementEvaluateUsage(user.id);
  if (!usage.allowed) {
    return rateLimitResponse(usage.used, usage.limit);
  }

  try {
    const { actualVerse, transcription } = await req.json();

    if (!actualVerse || typeof actualVerse !== "string") {
      return badRequest("Missing actualVerse");
    }

    if (!transcription || typeof transcription !== "string") {
      return badRequest("Missing transcription");
    }

    // Clean transcription with LLM
    const cleanedTranscription = await cleanTranscription(
      actualVerse,
      transcription
    );

    return jsonResponse({ cleanedTranscription });
  } catch (error) {
    console.error("Evaluation error:", error);
    return serverError("Evaluation failed");
  }
});

/**
 * Clean transcription using GPT-5-mini
 * Removes stutters, fillers, false starts while keeping user's actual words
 */
async function cleanTranscription(
  actualVerse: string,
  rawTranscription: string
): Promise<string> {
  if (!OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY not configured, returning raw transcription");
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
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: prompt }],
          },
        ],
        max_output_tokens: 1000,
        reasoning: { effort: "minimal" },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenAI API error:", error);
      return rawTranscription; // Fallback to raw
    }

    const result = await response.json();

    // Extract text from Responses API format
    const outputText = result.output?.[0]?.content?.find(
      (c: { type: string }) => c.type === "output_text"
    )?.text?.trim();

    return outputText || rawTranscription;
  } catch (error) {
    console.error("OpenAI request error:", error);
    return rawTranscription; // Fallback to raw
  }
}

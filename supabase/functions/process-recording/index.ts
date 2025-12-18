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
  checkTranscriptionUsage,
  checkEvaluateUsage,
  recordTranscriptionUsage,
  recordEvaluateUsage,
  rateLimitResponse,
} from "../_shared/usage.ts";
import {
  acquireTranscriptionLock,
  releaseTranscriptionLock,
} from "../_shared/concurrency.ts";

const SONIOX_API_KEY = Deno.env.get("SONIOX_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

interface ProcessingResult {
  transcription: string;
  cleanedTranscription: string;
  cleaningUsed: boolean;
}

serve(async (req) => {
  const requestStart = Date.now();

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

  let audioBlob: Blob;
  let durationSeconds: number;
  let actualVerse: string;

  try {
    // Parse multipart form data
    const formData = await req.formData();
    const audioFile = formData.get("audio");
    const durationStr = formData.get("durationSeconds");
    const verseStr = formData.get("actualVerse");

    if (!audioFile || !(audioFile instanceof File)) {
      return badRequest("Missing audio file");
    }
    if (!durationStr || typeof durationStr !== "string") {
      return badRequest("Missing durationSeconds");
    }
    if (!verseStr || typeof verseStr !== "string") {
      return badRequest("Missing actualVerse");
    }

    audioBlob = audioFile;
    durationSeconds = parseFloat(durationStr);
    actualVerse = verseStr;

    if (isNaN(durationSeconds) || durationSeconds <= 0) {
      return badRequest("Invalid durationSeconds");
    }

    // Check quotas
    const transcribeUsage = await checkTranscriptionUsage(user.id, durationSeconds);
    if (!transcribeUsage.allowed) {
      return rateLimitResponse(transcribeUsage.used, transcribeUsage.limit);
    }

    const evaluateUsage = await checkEvaluateUsage(user.id);
    if (!evaluateUsage.allowed) {
      return rateLimitResponse(evaluateUsage.used, evaluateUsage.limit);
    }

    // Acquire concurrency lock
    const hasLock = await acquireTranscriptionLock(user.id);
    if (!hasLock) {
      return jsonResponse(
        {
          error: "Transcription already in progress",
          code: "TRANSCRIPTION_IN_PROGRESS",
        },
        429
      );
    }

    console.log(`[PROCESS] User: ${user.id.slice(0, 8)}..., Duration: ${durationSeconds}s, Size: ${(audioBlob.size / 1024).toFixed(1)}KB`);

    const transcribeStart = Date.now();
    const transcription = await transcribeWithSoniox(audioBlob);
    const transcribeMs = Date.now() - transcribeStart;

    const rawWordCount = transcription.split(/\s+/).filter(Boolean).length;
    console.log(`[PROCESS] Transcription: ${transcribeMs}ms`);
    console.log(`[PROCESS] Raw (${rawWordCount} words, ${transcription.length} chars): "${transcription.slice(0, 200)}${transcription.length > 200 ? "..." : ""}"`);

    // Record transcription usage
    await recordTranscriptionUsage(user.id, durationSeconds);

    // ========== CLEANING ==========
    let cleanedTranscription: string;
    let cleaningUsed = false;

    try {
      const cleanStart = Date.now();
      const cleanResult = await cleanTranscription(actualVerse, transcription);
      const cleanMs = Date.now() - cleanStart;

      cleanedTranscription = cleanResult.text;

      // Check if cleaning actually ran (not just returned raw)
      cleaningUsed = cleanedTranscription !== transcription;

      if (cleaningUsed) {
        await recordEvaluateUsage(user.id);
        const cleanedWordCount = cleanedTranscription.split(/\s+/).filter(Boolean).length;
        const wordsRemoved = rawWordCount - cleanedWordCount;

        console.log(`[PROCESS] Cleaning: ${cleanMs}ms`);
        if (cleanResult.model) {
          console.log(`[PROCESS] Model: ${cleanResult.model}`);
        }
        if (cleanResult.usage) {
          console.log(`[PROCESS] Tokens - Input: ${cleanResult.usage.inputTokens}, Output: ${cleanResult.usage.outputTokens}, Total: ${cleanResult.usage.totalTokens}`);
        }
        console.log(`[PROCESS] Cleaned (${cleanedWordCount} words, ${cleanedTranscription.length} chars, ${wordsRemoved} words removed): "${cleanedTranscription.slice(0, 200)}${cleanedTranscription.length > 200 ? "..." : ""}"`);
      } else {
        console.log(`[PROCESS] Cleaning skipped or returned raw`);
      }
    } catch (cleanError) {
      console.error("[PROCESS] Cleaning failed, using raw:", cleanError);
      cleanedTranscription = transcription;
      cleaningUsed = false;
    }

    const totalMs = Date.now() - requestStart;
    console.log(`[PROCESS] Complete - Total: ${totalMs}ms (Transcribe: ${transcribeMs}ms, Clean: ${totalMs - transcribeMs - 50}ms approx)`);

    return jsonResponse({
      transcription,
      cleanedTranscription,
      cleaningUsed,
    } satisfies ProcessingResult);
  } catch (error) {
    console.error("[PROCESS] Error:", error);
    return serverError("Processing failed");
  } finally {
    // Always release the lock
    await releaseTranscriptionLock(user.id);
  }
});

/**
 * Transcribe audio using Soniox async API
 */
async function transcribeWithSoniox(audioBlob: Blob): Promise<string> {
  if (!SONIOX_API_KEY) {
    throw new Error("SONIOX_API_KEY not configured");
  }

  // Step 1: Upload audio file
  console.log(`[PROCESS] Soniox upload - Size: ${(audioBlob.size / 1024).toFixed(1)}KB, Type: ${audioBlob.type || "unknown"}`);

  const uploadForm = new FormData();
  uploadForm.append("file", audioBlob, "recording.m4a");

  const uploadRes = await fetch("https://api.soniox.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${SONIOX_API_KEY}` },
    body: uploadForm,
  });

  if (!uploadRes.ok) {
    const error = await uploadRes.text();
    console.error("Soniox upload error:", error);
    throw new Error("Failed to upload audio");
  }

  const uploadResult = await uploadRes.json();
  const fileId = uploadResult.id;
  console.log(`[PROCESS] Soniox file uploaded - ID: ${fileId}`);

  // Step 2: Create transcription job
  const jobRes = await fetch("https://api.soniox.com/v1/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SONIOX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file_id: fileId,
      model: "stt-async-preview",
      language_hints: ["en"],
    }),
  });

  if (!jobRes.ok) {
    const error = await jobRes.text();
    console.error("Soniox job error:", error);
    throw new Error("Failed to create transcription job");
  }

  const { id: transcriptionId } = await jobRes.json();

  // Step 3: Poll for completion (max 60 seconds)
  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    const statusRes = await fetch(
      `https://api.soniox.com/v1/transcriptions/${transcriptionId}`,
      { headers: { Authorization: `Bearer ${SONIOX_API_KEY}` } }
    );

    if (!statusRes.ok) {
      throw new Error("Failed to check transcription status");
    }

    const status = await statusRes.json();

    if (status.status === "completed") {
      break;
    }

    if (status.status === "error") {
      console.error("[PROCESS] Soniox transcription error:", JSON.stringify(status));
      throw new Error(`Transcription failed: ${status.error || status.message || "unknown error"}`);
    }

    // Wait 1 second before polling again
    await new Promise((resolve) => setTimeout(resolve, 1000));
    attempts++;
  }

  if (attempts >= maxAttempts) {
    throw new Error("Transcription timed out");
  }

  // Step 4: Get transcript
  const transcriptRes = await fetch(
    `https://api.soniox.com/v1/transcriptions/${transcriptionId}/transcript`,
    { headers: { Authorization: `Bearer ${SONIOX_API_KEY}` } }
  );

  if (!transcriptRes.ok) {
    throw new Error("Failed to get transcript");
  }

  const { text } = await transcriptRes.json();
  return text;
}

interface CleaningResult {
  text: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model?: string;
}

/**
 * Clean transcription using GPT-5-mini
 * Removes stutters, fillers, false starts while keeping user's actual words
 */
async function cleanTranscription(
  actualVerse: string,
  rawTranscription: string
): Promise<CleaningResult> {
  if (!OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY not configured, returning raw transcription");
    return { text: rawTranscription };
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
      console.error("[PROCESS] OpenAI API error status:", response.status);
      console.error("[PROCESS] OpenAI API error body:", error);
      return { text: rawTranscription }; // Fallback to raw
    }

    const result = await response.json();

    // Extract text from Responses API format
    const messageOutput = result.output?.find(
      (o: { type: string }) => o.type === "message"
    );
    const outputText = messageOutput?.content?.find(
      (c: { type: string }) => c.type === "output_text"
    )?.text?.trim();

    // Extract usage info
    const usage = result.usage ? {
      inputTokens: result.usage.input_tokens || 0,
      outputTokens: result.usage.output_tokens || 0,
      totalTokens: result.usage.total_tokens || (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
    } : undefined;

    return {
      text: outputText || rawTranscription,
      usage,
      model: result.model,
    };
  } catch (error) {
    console.error("OpenAI request error:", error);
    return { text: rawTranscription }; // Fallback to raw
  }
}

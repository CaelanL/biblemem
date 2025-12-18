import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { getAuthUser, getAdminClient } from "../_shared/auth.ts";
import { handleCors } from "../_shared/cors.ts";
import {
  unauthorized,
  badRequest,
  jsonResponse,
  serverError,
} from "../_shared/errors.ts";
import { recordTranscriptionUsage } from "../_shared/usage.ts";
import { releaseTranscriptionLock } from "../_shared/concurrency.ts";

const SONIOX_API_KEY = Deno.env.get("SONIOX_API_KEY");

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

  let storagePath: string | null = null;

  try {
    const body = await req.json();
    storagePath = body.storagePath;
    const durationSeconds = body.durationSeconds;

    if (!storagePath || typeof storagePath !== "string") {
      return badRequest("Missing storagePath");
    }

    if (typeof durationSeconds !== "number" || durationSeconds <= 0) {
      return badRequest("Missing or invalid durationSeconds");
    }

    // Verify the path belongs to this user
    if (!storagePath.startsWith(`${user.id}/`)) {
      return unauthorized("Invalid storage path");
    }

    // Download audio from Supabase Storage
    const admin = getAdminClient();
    const { data: audioData, error: downloadError } = await admin.storage
      .from("audio")
      .download(storagePath);

    if (downloadError || !audioData) {
      console.error("Storage download error:", downloadError);
      return badRequest("Failed to download audio file");
    }

    // Transcribe with Soniox
    const text = await transcribeWithSoniox(audioData);

    // Record usage AFTER successful transcription
    await recordTranscriptionUsage(user.id, durationSeconds);

    // Cleanup: delete audio file from storage
    await admin.storage.from("audio").remove([storagePath]);

    return jsonResponse({ text });
  } catch (error) {
    console.error("Transcription error:", error);
    return serverError("Transcription failed");
  } finally {
    // Always release the concurrency lock
    await releaseTranscriptionLock(user.id);

    // Try to cleanup storage even on error
    if (storagePath) {
      try {
        const admin = getAdminClient();
        await admin.storage.from("audio").remove([storagePath]);
      } catch {
        // Ignore cleanup errors
      }
    }
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

  const { id: fileId } = await uploadRes.json();

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
      throw new Error("Transcription failed");
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

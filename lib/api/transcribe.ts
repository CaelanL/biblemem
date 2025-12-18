import { getAuthToken, getSupabaseUrl } from "./client";

interface UploadUrlResponse {
  uploadUrl: string;
  path: string;
  token: string;
  expiresIn: number;
}

/**
 * Transcribe audio using the backend Soniox integration
 *
 * Flow:
 * 1. Get signed upload URL from backend
 * 2. Upload audio to Supabase Storage
 * 3. Request transcription (backend downloads from storage, sends to Soniox)
 * 4. Return transcript text
 *
 * @param audioUri - Local URI of the audio file
 * @param durationSeconds - Duration of the audio in seconds (for usage metering)
 * @returns Transcribed text
 */
export async function transcribeAudio(
  audioUri: string,
  durationSeconds: number
): Promise<string> {
  const token = await getAuthToken();
  const baseUrl = getSupabaseUrl();

  // Step 1: Get signed upload URL
  const uploadUrlResponse = await fetch(`${baseUrl}/functions/v1/upload-url`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ durationSeconds }),
  });

  if (!uploadUrlResponse.ok) {
    const error = await uploadUrlResponse.json().catch(() => ({}));

    if (uploadUrlResponse.status === 429) {
      if (error.code === "TRANSCRIPTION_IN_PROGRESS") {
        throw new Error("A transcription is already in progress");
      }
      throw new Error(
        `Daily limit reached (${error.used}/${error.limit} seconds). Resets at ${error.resetsAt || "midnight UTC"}`
      );
    }

    throw new Error(error.error || "Failed to get upload URL");
  }

  const { uploadUrl, path }: UploadUrlResponse =
    await uploadUrlResponse.json();

  // Step 2: Upload audio to Supabase Storage
  const audioResponse = await fetch(audioUri);
  const audioBlob = await audioResponse.blob();

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "audio/m4a",
    },
    body: audioBlob,
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload audio");
  }

  // Step 3: Request transcription
  const transcribeResponse = await fetch(
    `${baseUrl}/functions/v1/transcribe`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        storagePath: path,
        durationSeconds,
      }),
    }
  );

  if (!transcribeResponse.ok) {
    const error = await transcribeResponse.json().catch(() => ({}));
    throw new Error(error.error || "Transcription failed");
  }

  const { text } = await transcribeResponse.json();
  return text;
}

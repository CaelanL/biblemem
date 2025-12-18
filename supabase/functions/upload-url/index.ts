import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { getAuthUser, getAdminClient } from "../_shared/auth.ts";
import { handleCors } from "../_shared/cors.ts";
import {
  unauthorized,
  badRequest,
  jsonResponse,
  serverError,
} from "../_shared/errors.ts";
import {
  checkTranscriptionUsage,
  rateLimitResponse,
} from "../_shared/usage.ts";
import { acquireTranscriptionLock } from "../_shared/concurrency.ts";

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

  try {
    const { durationSeconds } = await req.json();

    if (typeof durationSeconds !== "number" || durationSeconds <= 0) {
      return badRequest("Invalid durationSeconds");
    }

    // Check usage BEFORE giving upload URL
    const usage = await checkTranscriptionUsage(user.id, durationSeconds);
    if (!usage.allowed) {
      return rateLimitResponse(usage.used, usage.limit);
    }

    // Try to acquire concurrency lock
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

    // Generate signed upload URL
    const admin = getAdminClient();
    const path = `${user.id}/${Date.now()}.m4a`;

    const { data, error } = await admin.storage
      .from("audio")
      .createSignedUploadUrl(path);

    if (error) {
      console.error("Storage error:", error);
      return serverError("Failed to create upload URL");
    }

    return jsonResponse({
      uploadUrl: data.signedUrl,
      path,
      token: data.token,
      expiresIn: 300, // 5 minutes
    });
  } catch (error) {
    console.error("Upload URL error:", error);
    return serverError("Failed to process request");
  }
});

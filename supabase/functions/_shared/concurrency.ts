import { getAdminClient } from "./auth.ts";

/**
 * Try to acquire a transcription lock for a user
 * Returns true if lock acquired, false if user already has an active job
 */
export async function acquireTranscriptionLock(
  userId: string
): Promise<boolean> {
  const admin = getAdminClient();

  // First, cleanup any stale locks (> 5 minutes old)
  await admin.rpc("cleanup_stale_transcription_locks");

  // Try to insert a lock row
  const { error } = await admin.from("transcription_locks").insert({
    user_id: userId,
    started_at: new Date().toISOString(),
  });

  // If unique constraint violation, user already has a lock
  if (error?.code === "23505") {
    return false;
  }

  // Any other error is unexpected
  if (error) {
    console.error("Lock acquisition error:", error);
    return false;
  }

  return true;
}

/**
 * Release transcription lock for a user
 * Call this in a finally block to ensure cleanup
 */
export async function releaseTranscriptionLock(userId: string): Promise<void> {
  const admin = getAdminClient();

  const { error } = await admin
    .from("transcription_locks")
    .delete()
    .eq("user_id", userId);

  if (error) {
    console.error("Lock release error:", error);
  }
}

/**
 * Check if user has an active transcription lock
 */
export async function hasTranscriptionLock(userId: string): Promise<boolean> {
  const admin = getAdminClient();

  const { data } = await admin
    .from("transcription_locks")
    .select("user_id")
    .eq("user_id", userId)
    .single();

  return data !== null;
}

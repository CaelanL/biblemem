/**
 * Analytics API
 *
 * Functions for logging and querying session attempt data.
 */

import { supabase } from './client';
import type { Difficulty } from '@/lib/storage';

export interface SessionAttemptData {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  version: string;
  difficulty: Difficulty;
  chunkSize: number;
  accuracy: number;
  recordingDurationMs?: number;
}

/**
 * Log a completed session attempt
 */
export async function logSessionAttempt(data: SessionAttemptData): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('[ANALYTICS] Not authenticated, skipping attempt log');
    return;
  }

  const { error } = await supabase.from('session_attempts').insert({
    user_id: user.id,
    book: data.book,
    chapter: data.chapter,
    verse_start: data.verseStart,
    verse_end: data.verseEnd,
    version: data.version,
    difficulty: data.difficulty,
    chunk_size: data.chunkSize,
    accuracy: data.accuracy,
    recording_duration_ms: data.recordingDurationMs,
  });

  if (error) {
    console.error('[ANALYTICS] Failed to log session attempt:', error);
  }
}

/**
 * Get current practice streak (consecutive days with at least one attempt)
 * Returns 0 if no attempts or streak broken
 */
export async function getCurrentStreak(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  // Get distinct practice days, ordered descending
  const { data, error } = await supabase
    .from('session_attempts')
    .select('created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) return 0;

  // Get unique dates (in UTC)
  const uniqueDates = [...new Set(
    data.map(row => new Date(row.created_at).toISOString().split('T')[0])
  )].sort().reverse();

  if (uniqueDates.length === 0) return 0;

  // Check if most recent practice was today or yesterday
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) {
    // Streak broken - last practice was before yesterday
    return 0;
  }

  // Count consecutive days
  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const currentDate = new Date(uniqueDates[i - 1]);
    const prevDate = new Date(uniqueDates[i]);
    const diffDays = Math.round((currentDate.getTime() - prevDate.getTime()) / 86400000);

    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Get total practice days count
 */
export async function getTotalPracticeDays(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data, error } = await supabase
    .from('session_attempts')
    .select('created_at')
    .eq('user_id', user.id);

  if (error || !data) return 0;

  const uniqueDates = new Set(
    data.map(row => new Date(row.created_at).toISOString().split('T')[0])
  );

  return uniqueDates.size;
}

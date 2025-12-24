import { useState, useEffect, useCallback } from 'react';
import { getCurrentStreak } from '@/lib/api';

interface UseStreakReturn {
  streak: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch and cache the current practice streak
 */
export function useStreak(): UseStreakReturn {
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const currentStreak = await getCurrentStreak();
      setStreak(currentStreak);
    } catch (e) {
      console.error('[STREAK] Failed to fetch streak:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { streak, loading, refresh };
}

import { useRef, useCallback } from 'react';

/**
 * Hook to debounce rapid button presses (prevents double-tap issues)
 * @param onPress - The press handler to debounce
 * @param delay - Minimum time between presses in ms (default 500ms)
 */
export function useDebouncedPress(onPress: () => void, delay = 500) {
  const lastPressRef = useRef(0);

  return useCallback(() => {
    const now = Date.now();
    if (now - lastPressRef.current > delay) {
      lastPressRef.current = now;
      onPress();
    }
  }, [onPress, delay]);
}

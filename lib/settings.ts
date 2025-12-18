import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export type BibleVersion = 'ESV' | 'NLT';

export interface AppSettings {
  bibleVersion: BibleVersion;
}

const SETTINGS_KEY = 'app_settings';

const DEFAULT_SETTINGS: AppSettings = {
  bibleVersion: 'ESV',
};

// ============================================================================
// Storage Functions
// ============================================================================

export async function getSettings(): Promise<AppSettings> {
  try {
    const data = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!data) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  return updated;
}

// ============================================================================
// Hook
// ============================================================================

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  // Update a setting
  const updateSetting = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      const updated = await saveSettings({ [key]: value });
      setSettings(updated);
    },
    []
  );

  // Convenience setters
  const setBibleVersion = useCallback(
    (version: BibleVersion) => updateSetting('bibleVersion', version),
    [updateSetting]
  );

  return {
    settings,
    loading,
    setBibleVersion,
  };
}

// ============================================================================
// Translation Display Info
// ============================================================================

export const BIBLE_VERSIONS: { value: BibleVersion; label: string; full: string }[] = [
  { value: 'ESV', label: 'ESV', full: 'English Standard Version' },
  { value: 'NLT', label: 'NLT', full: 'New Living Translation' },
];

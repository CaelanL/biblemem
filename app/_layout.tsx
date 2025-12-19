import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { useEffect } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ensureAuth } from '@/lib/api';
import { migrateLocalDataToServer } from '@/lib/sync';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Initialize auth and run migration on app start
  useEffect(() => {
    async function initApp() {
      try {
        // Ensure user is authenticated (creates anonymous user if needed)
        await ensureAuth();

        // Migrate local data to server (runs once per device)
        await migrateLocalDataToServer();
      } catch (e) {
        console.error('[App] Initialization error:', e);
      }
    }
    initApp();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="session" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

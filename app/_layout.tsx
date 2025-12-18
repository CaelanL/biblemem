import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // TODO: Add login/signup flow before using API features
  // For now, skip auth initialization - will add proper auth screens later

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerBackButtonDisplayMode: 'minimal', // Show only back arrow, no text (iOS)
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="collection/[id]" options={{ title: 'Collection' }} />
        <Stack.Screen name="add/index" options={{ title: 'Add Verse' }} />
        <Stack.Screen name="add/[book]/[chapter]" options={{ title: 'Select Verses' }} />
        <Stack.Screen name="study/[id]" options={{ title: 'Setup' }} />
        <Stack.Screen name="study/session" options={{ title: 'Study' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

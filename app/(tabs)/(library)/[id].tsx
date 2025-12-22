import { AppHeader } from '@/components/app-header';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SwipeableVerseCard } from '@/components/library/SwipeableVerseCard';
import { VerseCardSkeleton } from '@/components/library/VerseCardSkeleton';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatVerseReference, type SavedVerse } from '@/lib/storage';
import { useAppStore, useVersesByCollection, useCollection, useHydrated } from '@/lib/store';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  RefreshControl,
} from 'react-native';

export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';

  // Store data
  const collection = useCollection(id || '');
  const verses = useVersesByCollection(id || '');
  const hydrated = useHydrated();
  const deleteVerse = useAppStore((s) => s.deleteVerse);
  const refresh = useAppStore((s) => s.refresh);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleAddVerse = () => {
    router.push(`/(tabs)/(library)/add?collectionId=${id}`);
  };

  const handleVersePress = (verse: SavedVerse) => {
    router.push(`/(tabs)/(library)/setup/${verse.id}`);
  };

  const handleDeleteVerse = async (verseId: string) => {
    await deleteVerse(verseId);
  };

  const primaryColor = isDark ? '#60a5fa' : '#0a7ea4';

  // Sort verses by createdAt descending
  const sortedVerses = [...verses].sort((a, b) => b.createdAt - a.createdAt);

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
        <IconSymbol name="book.closed" size={40} color={colors.icon} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No verses yet</Text>
      <Text style={[styles.emptySubtitle, { color: colors.icon }]}>
        Add your first verse to start memorizing
      </Text>
      <Pressable
        style={[styles.emptyButton, { backgroundColor: primaryColor }]}
        onPress={handleAddVerse}
      >
        <IconSymbol name="plus" size={18} color="#fff" />
        <Text style={styles.emptyButtonText}>Add Verse</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        title={collection?.name || 'Collection'}
        rightButton={{
          label: 'Add',
          icon: 'plus',
          onPress: handleAddVerse,
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={!hydrated || sortedVerses.length === 0 ? styles.emptyContainer : styles.versesContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
        }
      >
        {!hydrated ? (
          <View style={styles.skeletonContainer}>
            <VerseCardSkeleton count={3} />
          </View>
        ) : sortedVerses.length === 0 ? (
          renderEmptyState()
        ) : (
          sortedVerses.map((v, i) => (
            <SwipeableVerseCard
              key={v.id}
              verse={v}
              index={i}
              onPress={() => handleVersePress(v)}
              onDelete={() => handleDeleteVerse(v.id)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  skeletonContainer: {
    padding: 16,
  },
  versesContainer: {
    padding: 16,
    gap: 12,
  },
  emptyState: {
    alignItems: 'center',
    gap: 12,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 40,
    marginBottom: 8,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

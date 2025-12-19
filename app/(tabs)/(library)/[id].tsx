import { AppHeader } from '@/components/app-header';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SwipeableVerseCard } from '@/components/library/SwipeableVerseCard';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getCollections,
  getVersesByCollection,
  formatVerseReference,
  type SavedVerse,
  type Collection,
} from '@/lib/storage';
import { syncDeleteVerse } from '@/lib/sync';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const [collection, setCollection] = useState<Collection | null>(null);
  const [verses, setVerses] = useState<SavedVerse[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;

    const colls = await getCollections();
    const coll = colls.find((c) => c.id === id);
    setCollection(coll || null);

    const v = await getVersesByCollection(id);
    setVerses(v.sort((a, b) => b.createdAt - a.createdAt));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAddVerse = () => {
    router.push(`/(tabs)/(library)/add?collectionId=${id}`);
  };

  const handleVersePress = (verse: SavedVerse) => {
    router.push(`/(tabs)/(library)/setup/${verse.id}`);
  };

  const handleDeleteVerse = async (verseId: string) => {
    await syncDeleteVerse(verseId);
    await loadData();
  };

  const primaryColor = isDark ? '#60a5fa' : '#0a7ea4';

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
        contentContainerStyle={verses.length === 0 ? styles.emptyContainer : styles.versesContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
        }
      >
        {verses.length === 0
          ? renderEmptyState()
          : verses.map((v, i) => (
              <SwipeableVerseCard
                key={v.id}
                verse={v}
                index={i}
                onPress={() => handleVersePress(v)}
                onDelete={() => handleDeleteVerse(v.id)}
              />
            ))}
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

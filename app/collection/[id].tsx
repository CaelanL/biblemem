import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getCollections,
  getVersesByCollection,
  deleteVerse,
  formatVerseReference,
  type SavedVerse,
  type Collection,
} from '@/lib/storage';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  RefreshControl,
  Alert,
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
    // Pass collection ID so verse gets added to this collection
    router.push(`/add?collectionId=${id}`);
  };

  const handleVersePress = (verse: SavedVerse) => {
    router.push(`/study/${verse.id}`);
  };

  const handleVerseLongPress = (verse: SavedVerse) => {
    Alert.alert(
      formatVerseReference(verse),
      'What would you like to do?',
      [
        { text: 'Study', onPress: () => router.push(`/study/${verse.id}`) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDeleteVerse(verse),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleDeleteVerse = async (verse: SavedVerse) => {
    await deleteVerse(verse.id);
    await loadData();
  };

  const cardBg = isDark ? '#1c1c1e' : '#ffffff';
  const borderColor = isDark ? 'rgba(96,165,250,0.3)' : 'rgba(10,126,164,0.25)';
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

  const renderVerseCard = (verse: SavedVerse, index: number) => (
    <Animated.View
      key={verse.id}
      entering={FadeInDown.delay(index * 60).duration(300)}
    >
      <Pressable
        style={[
          styles.verseCard,
          {
            backgroundColor: cardBg,
            borderColor,
          },
        ]}
        onPress={() => handleVersePress(verse)}
        onLongPress={() => handleVerseLongPress(verse)}
      >
        <View style={styles.cardContent}>
          <View style={[styles.iconContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
            <IconSymbol name="book.fill" size={20} color={colors.icon} />
          </View>
          <View style={styles.cardText}>
            <Text style={[styles.verseReference, { color: primaryColor }]}>
              {formatVerseReference(verse)}
            </Text>
            <Text style={[styles.versePreview, { color: colors.text }]} numberOfLines={2}>
              {verse.text}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: collection?.name || 'Collection',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerRight: () => (
            <Pressable
              style={[styles.headerButton, { backgroundColor: primaryColor }]}
              onPress={handleAddVerse}
            >
              <IconSymbol name="plus" size={16} color="#fff" />
              <Text style={styles.headerButtonText}>Add</Text>
            </Pressable>
          ),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={verses.length === 0 ? styles.emptyContainer : styles.versesContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
        }
      >
        {verses.length === 0 ? renderEmptyState() : verses.map((v, i) => renderVerseCard(v, i))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  headerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  verseCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  verseReference: {
    fontSize: 15,
    fontWeight: '600',
  },
  versePreview: {
    fontSize: 15,
    lineHeight: 21,
  },
});

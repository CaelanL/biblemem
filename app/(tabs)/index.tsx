import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getSavedVerses, deleteVerse, formatVerseReference, type SavedVerse } from '@/lib/storage';
import { router } from 'expo-router';
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

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const [verses, setVerses] = useState<SavedVerse[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadVerses = useCallback(async () => {
    const saved = await getSavedVerses();
    setVerses(saved.sort((a, b) => b.createdAt - a.createdAt));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadVerses();
    }, [loadVerses])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadVerses();
    setRefreshing(false);
  };

  const handleAddVerse = () => {
    router.push('/add');
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
    await loadVerses();
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <IconSymbol name="book.closed" size={64} color={colors.icon} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No verses yet</Text>
      <Text style={[styles.emptySubtitle, { color: colors.icon }]}>
        Add your first verse to start memorizing
      </Text>
    </View>
  );

  const renderVerseCard = (verse: SavedVerse) => (
    <Pressable
      key={verse.id}
      style={[styles.verseCard, { backgroundColor: colors.background, shadowColor: colors.text }]}
      onPress={() => handleVersePress(verse)}
      onLongPress={() => handleVerseLongPress(verse)}
    >
      <Text style={[styles.verseReference, { color: isDark ? '#60a5fa' : colors.tint }]}>
        {formatVerseReference(verse)}
      </Text>
      <Text style={[styles.versePreview, { color: colors.text }]} numberOfLines={2}>
        {verse.text}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>My Verses</Text>
        <Pressable
          style={[styles.addButton, { backgroundColor: isDark ? '#3b82f6' : colors.tint }]}
          onPress={handleAddVerse}
        >
          <IconSymbol name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={verses.length === 0 ? styles.emptyContainer : styles.versesContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
        }
      >
        {verses.length === 0 ? renderEmptyState() : verses.map(renderVerseCard)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  verseCard: {
    padding: 16,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  verseReference: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  versePreview: {
    fontSize: 16,
    lineHeight: 22,
  },
});

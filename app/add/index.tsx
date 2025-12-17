import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { BIBLE_BOOKS, OLD_TESTAMENT_END } from '@/lib/bible/books';
import { getChapterCount } from '@/lib/bible';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function AddVerseScreen() {
  const { collectionId } = useLocalSearchParams<{ collectionId?: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [expandedBook, setExpandedBook] = useState<string | null>(null);

  const handleBookPress = (book: string) => {
    setExpandedBook(expandedBook === book ? null : book);
  };

  const handleChapterPress = (book: string, chapter: number) => {
    const params = collectionId ? `?collectionId=${collectionId}` : '';
    router.push(`/add/${encodeURIComponent(book)}/${chapter}${params}`);
  };

  const renderChapterGrid = (book: string) => {
    const chapterCount = getChapterCount(book);
    const chapters = Array.from({ length: chapterCount }, (_, i) => i + 1);

    return (
      <View style={styles.chapterGrid}>
        {chapters.map((chapter) => (
          <Pressable
            key={chapter}
            style={[styles.chapterButton, { backgroundColor: colors.background }]}
            onPress={() => handleChapterPress(book, chapter)}
          >
            <Text style={[styles.chapterText, { color: colors.text }]}>{chapter}</Text>
          </Pressable>
        ))}
      </View>
    );
  };

  const renderBook = (book: string, index: number) => {
    const isExpanded = expandedBook === book;
    const isNewTestament = index === OLD_TESTAMENT_END + 1;

    return (
      <View key={book}>
        {isNewTestament && (
          <View style={[styles.testamentDivider, { borderBottomColor: colors.icon }]}>
            <Text style={[styles.testamentLabel, { color: colors.icon }]}>New Testament</Text>
          </View>
        )}
        {index === 0 && (
          <View style={[styles.testamentDivider, { borderBottomColor: colors.icon }]}>
            <Text style={[styles.testamentLabel, { color: colors.icon }]}>Old Testament</Text>
          </View>
        )}
        <Pressable
          style={[styles.bookRow, { borderBottomColor: colors.icon + '30' }]}
          onPress={() => handleBookPress(book)}
        >
          <Text style={[styles.bookName, { color: colors.text }]}>{book}</Text>
          <IconSymbol
            name={isExpanded ? 'chevron.down' : 'chevron.right'}
            size={18}
            color={colors.icon}
          />
        </Pressable>
        {isExpanded && renderChapterGrid(book)}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: 'Add Verse',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />
      <ScrollView style={styles.scrollView}>
        {BIBLE_BOOKS.map((book, index) => renderBook(book, index))}
        <View style={styles.bottomPadding} />
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
  testamentDivider: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  testamentLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bookName: {
    fontSize: 17,
  },
  chapterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 8,
  },
  chapterButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  chapterText: {
    fontSize: 16,
    fontWeight: '500',
  },
  bottomPadding: {
    height: 40,
  },
});

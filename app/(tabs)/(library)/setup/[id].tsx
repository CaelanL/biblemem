import { AppHeader } from '@/components/app-header';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getSavedVerses, formatVerseReference, type SavedVerse } from '@/lib/storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';

type Difficulty = 'easy' | 'medium' | 'hard';

export default function StudySetupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';

  const [verse, setVerse] = useState<SavedVerse | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [chunkSize, setChunkSize] = useState(1);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownItems, setDropdownItems] = useState<{label: string; value: number}[]>([]);

  // Calculate total verses in this passage
  const totalVerses = verse ? verse.verseEnd - verse.verseStart + 1 : 1;
  // Available chunk sizes (1, 2, 3... up to total verses, max 5)
  const maxChunkSize = Math.min(totalVerses, 5);

  // Reload verse data when screen comes into focus (to get updated progress)
  useFocusEffect(
    useCallback(() => {
      loadVerse();
    }, [id])
  );

  // Update dropdown items when verse loads
  useEffect(() => {
    if (verse) {
      const total = verse.verseEnd - verse.verseStart + 1;
      const max = Math.min(total, 5);
      const items = Array.from({ length: max }, (_, i) => ({
        label: String(i + 1),
        value: i + 1,
      }));
      setDropdownItems(items);
    }
  }, [verse]);

  const loadVerse = async () => {
    const verses = await getSavedVerses();
    const found = verses.find((v) => v.id === id);
    setVerse(found ?? null);
    setLoading(false);
  };

  const handleStartSession = () => {
    if (!verse) return;
    // Session is at root level, outside tabs
    router.push(`/session?id=${id}&difficulty=${difficulty}&chunkSize=${chunkSize}`);
  };

  const buttonBg = isDark ? '#3b82f6' : '#0a7ea4';

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (!verse) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <AppHeader title="Setup" />
        <Text style={{ color: colors.text }}>Verse not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="Setup" />

      <View style={styles.content}>
        {/* Verse Preview */}
        <View style={[styles.previewCard, { backgroundColor: isDark ? '#1e1e1e' : '#f5f5f5' }]}>
          <Text style={[styles.reference, { color: isDark ? '#60a5fa' : colors.tint }]}>
            {formatVerseReference(verse)}
          </Text>
          <Text style={[styles.previewText, { color: colors.text }]} numberOfLines={4}>
            {verse.text}
          </Text>
        </View>

        {/* Difficulty Selection */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Difficulty</Text>
          <View style={[styles.segmentedControl, { backgroundColor: isDark ? '#1e1e1e' : '#e5e5e5' }]}>
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((level) => (
              <Pressable
                key={level}
                style={[
                  styles.segment,
                  difficulty === level && { backgroundColor: buttonBg },
                ]}
                onPress={() => setDifficulty(level)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: difficulty === level ? '#fff' : colors.text },
                  ]}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </Text>
                <Text
                  style={[
                    styles.segmentSubtext,
                    { color: difficulty === level ? 'rgba(255,255,255,0.7)' : colors.icon },
                  ]}
                >
                  {level === 'easy' && 'All words'}
                  {level === 'medium' && 'Some hidden'}
                  {level === 'hard' && 'No words'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Progress Stats */}
        <View style={styles.progressSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Progress</Text>
          <View style={styles.progressRow}>
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((level) => {
              const progress = verse.progress[level];
              const hasScore = progress.bestAccuracy !== null;
              return (
                <View key={level} style={styles.progressItem}>
                  <Text style={[styles.progressLabel, { color: colors.icon }]}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </Text>
                  <Text
                    style={[
                      styles.progressValue,
                      {
                        color: progress.completed
                          ? '#22c55e'
                          : hasScore
                          ? '#f59e0b'
                          : colors.icon,
                      },
                    ]}
                  >
                    {hasScore ? `${progress.bestAccuracy}%` : '--'}
                    {progress.completed && ' ✓'}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Chunk Size Selection - only show if multiple verses */}
        {totalVerses > 1 && (
          <View style={[styles.chunkRow, { zIndex: 1000 }]}>
            <Text style={[styles.chunkLabel, { color: colors.text }]}>Verses per chunk</Text>
            <DropDownPicker
              open={dropdownOpen}
              value={chunkSize}
              items={dropdownItems}
              setOpen={setDropdownOpen}
              setValue={setChunkSize}
              setItems={setDropdownItems}
              style={[styles.dropdown, { backgroundColor: isDark ? '#1e1e1e' : '#e5e5e5', borderWidth: 0 }]}
              dropDownContainerStyle={[styles.dropdownContainer, { backgroundColor: isDark ? '#1e1e1e' : '#e5e5e5', borderWidth: 0 }]}
              textStyle={{ color: colors.text, fontSize: 16, fontWeight: '600' }}
              arrowIconStyle={{ tintColor: colors.icon } as any}
              tickIconStyle={{ tintColor: colors.text } as any}
              listItemLabelStyle={{ color: colors.text }}
              selectedItemContainerStyle={{ backgroundColor: isDark ? '#2e2e2e' : '#d5d5d5' }}
              containerStyle={{ width: 60 }}
              showTickIcon={false}
            />
          </View>
        )}

        {/* Start Button */}
        <View style={styles.bottomSection}>
          <Pressable
            style={[styles.startButton, { backgroundColor: buttonBg }]}
            onPress={handleStartSession}
          >
            <Text style={styles.startButtonText}>Start Session</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  reference: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  previewText: {
    fontSize: 16,
    lineHeight: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600',
  },
  segmentSubtext: {
    fontSize: 11,
    marginTop: 2,
  },
  progressSection: {
    marginBottom: 24,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  progressItem: {
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 13,
    marginBottom: 4,
  },
  progressValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  chunkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  chunkLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
  dropdown: {
    borderRadius: 10,
    minHeight: 44,
  },
  dropdownContainer: {
    borderRadius: 10,
  },
  bottomSection: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 20,
  },
  startButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});

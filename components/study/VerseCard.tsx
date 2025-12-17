import React from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions } from 'react-native';
import Animated, { Layout } from 'react-native-reanimated';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Chunk, Difficulty } from '@/lib/study-chunks';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_MAX_HEIGHT = SCREEN_HEIGHT * 0.30;
const SCROLL_MAX_HEIGHT = CARD_MAX_HEIGHT - 28 - 16 - 20 - 20;

interface VerseCardProps {
  chunk: Chunk;
  difficulty: Difficulty;
  verseLabel: string;
}

export function VerseCard({ chunk, difficulty, verseLabel }: VerseCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';

  const cardBg = isDark ? '#1c1c1e' : '#ffffff';
  const badgeBg = isDark ? 'rgba(96,165,250,0.15)' : 'rgba(10,126,164,0.1)';
  const accentColor = isDark ? '#60a5fa' : colors.tint;
  const borderColor = isDark ? 'rgba(96,165,250,0.3)' : 'rgba(10,126,164,0.25)';

  return (
    <Animated.View
      style={[
        styles.card,
        styles.cardShadow,
        { backgroundColor: cardBg, maxHeight: CARD_MAX_HEIGHT, borderColor },
      ]}
      layout={Layout.duration(300)}
    >
      <View style={styles.cardContent}>
        {/* Reference Badge */}
        <View style={[styles.referenceBadge, { backgroundColor: badgeBg }]}>
          <IconSymbol name="book.fill" size={14} color={accentColor} />
          <Text style={[styles.referenceBadgeText, { color: accentColor }]}>
            {verseLabel}
          </Text>
        </View>

        {/* Verse Text */}
        <ScrollView
          style={[styles.cardScrollContent, { maxHeight: SCROLL_MAX_HEIGHT }]}
          contentContainerStyle={styles.verseTextContainer}
        >
          {difficulty === 'hard' ? (
            <View style={styles.hardModeContainer}>
              <View style={[styles.hardModeIcon, { backgroundColor: badgeBg }]}>
                <IconSymbol name="lightbulb.fill" size={28} color={accentColor} />
              </View>
              <Text style={[styles.hardModeHint, { color: colors.icon }]}>
                Recite from memory
              </Text>
            </View>
          ) : (
            <Text style={[styles.chunkText, { color: colors.text }]}>
              {chunk.displayText}
            </Text>
          )}
        </ScrollView>
      </View>
    </Animated.View>
  );
}

export { CARD_MAX_HEIGHT, SCROLL_MAX_HEIGHT };

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardContent: {
    padding: 20,
  },
  referenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  referenceBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  cardScrollContent: {
    flexGrow: 0,
  },
  verseTextContainer: {
    paddingBottom: 4,
  },
  chunkText: {
    fontSize: 19,
    lineHeight: 30,
  },
  hardModeContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  hardModeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  hardModeHint: {
    fontSize: 16,
    textAlign: 'center',
  },
});

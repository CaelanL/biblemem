import React from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions } from 'react-native';
import Animated, { withDelay, withTiming, Easing } from 'react-native-reanimated';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { AlignmentWord } from '@/lib/study-chunks';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_MAX_HEIGHT = SCREEN_HEIGHT * 0.30;

type ResultStatus = 'success' | 'partial' | 'retry';

interface ResultCardProps {
  score: number;
  alignment?: AlignmentWord[];
  transcription?: string;
}

const STATUS_CONFIG = {
  success: {
    icon: 'checkmark.circle.fill' as const,
    label: 'Perfect!',
    color: '#22c55e',
  },
  partial: {
    icon: 'checkmark.circle' as const,
    label: 'Good effort!',
    color: '#f59e0b',
  },
  retry: {
    icon: 'arrow.clockwise' as const,
    label: 'Try again',
    color: '#ef4444',
  },
};

function getStatus(score: number): ResultStatus {
  if (score >= 90) return 'success';
  if (score >= 70) return 'partial';
  return 'retry';
}

function getStatusColors(status: ResultStatus, isDark: boolean) {
  const color = STATUS_CONFIG[status].color;
  return {
    bg: isDark ? `${color}1a` : `${color}14`, // 10% and 8% opacity
    border: `${color}4d`, // 30% opacity
    text: color,
  };
}

/**
 * Custom entering animation for the result card
 */
const customEntering = () => {
  'worklet';
  const animConfig = { duration: 400, easing: Easing.bezier(0.25, 0.46, 0.45, 0.94) };
  return {
    initialValues: {
      opacity: 0,
      transform: [{ translateY: 30 }, { scale: 0.95 }],
    },
    animations: {
      opacity: withDelay(100, withTiming(1, animConfig)),
      transform: [
        { translateY: withDelay(100, withTiming(0, animConfig)) },
        { scale: withDelay(100, withTiming(1, animConfig)) },
      ],
    },
  };
};

/**
 * Renders word alignment with color-coded status
 */
function AlignmentDisplay({ alignment, textColor }: { alignment: AlignmentWord[]; textColor: string }) {
  return (
    <Text style={styles.alignmentContainer}>
      {alignment.map((item, i) => {
        let color = textColor; // default/correct
        if (item.status === 'wrong' || item.status === 'missing') {
          color = '#ef4444'; // red
        } else if (item.status === 'close') {
          color = '#f59e0b'; // yellow/amber
        } else if (item.status === 'added') {
          color = '#ef4444'; // red for added too
        }

        return (
          <Text key={i} style={{ color }}>
            {item.word}{i < alignment.length - 1 ? ' ' : ''}
          </Text>
        );
      })}
    </Text>
  );
}

export function ResultCard({ score, alignment, transcription }: ResultCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';

  const status = getStatus(score);
  const statusConfig = STATUS_CONFIG[status];
  const statusColors = getStatusColors(status, isDark);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: statusColors.bg,
          borderColor: statusColors.border,
          maxHeight: CARD_MAX_HEIGHT,
        },
      ]}
      entering={customEntering}
    >
      <View style={styles.cardContent}>
        {/* Header with status */}
        <View style={styles.header}>
          <View style={styles.statusRow}>
            <IconSymbol name={statusConfig.icon as any} size={18} color={statusColors.text} />
            <Text style={[styles.statusLabel, { color: statusColors.text }]}>
              {statusConfig.label}
            </Text>
          </View>
          <View style={[styles.scoreBadge, { backgroundColor: `${statusColors.text}20` }]}>
            <Text style={[styles.scoreBadgeText, { color: statusColors.text }]}>
              {score}% match
            </Text>
          </View>
        </View>

        {/* Transcription/Alignment */}
        <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner}>
          {alignment && alignment.length > 0 ? (
            <AlignmentDisplay alignment={alignment} textColor={colors.text} />
          ) : transcription ? (
            <Text style={[styles.transcriptionText, { color: colors.text }]}>
              "{transcription}"
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardContent: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  scoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scoreBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    flexGrow: 0,
  },
  scrollInner: {
    paddingBottom: 4,
  },
  alignmentContainer: {
    fontSize: 16,
    lineHeight: 26,
  },
  transcriptionText: {
    fontSize: 16,
    lineHeight: 26,
  },
});

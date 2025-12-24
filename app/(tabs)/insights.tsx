import { AppHeader } from '@/components/app-header';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useStreak } from '@/hooks/use-streak';
import { useInsightsStats, useMostMemorizedBooks } from '@/lib/store';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

interface StatCardProps {
  value: number;
  label: string;
  icon: string;
  iconBgColor: string;
  iconColor: string;
}

function StatCard({ value, label, icon, iconBgColor, iconColor }: StatCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const cardBg = isDark ? '#1e1e1e' : '#f5f5f5';

  return (
    <View style={[styles.statCard, { backgroundColor: cardBg }]}>
      <Text style={[styles.statLabel, { color: colors.icon }]}>{label}</Text>
      <View style={styles.statRow}>
        <View style={[styles.iconContainer, { backgroundColor: iconBgColor }]}>
          <IconSymbol name={icon as any} size={18} color={iconColor} />
        </View>
        <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

export default function InsightsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';

  const stats = useInsightsStats();
  const topBooks = useMostMemorizedBooks();
  const { streak } = useStreak();
  const streakIcon = streak > 0 ? 'flame.fill' : 'snowflake';
  const streakColor = streak > 0 ? '#f97316' : '#60a5fa';
  const streakBg = streak > 0 ? 'rgba(249,115,22,0.15)' : 'rgba(96,165,250,0.15)';
  const streakMessage = streak > 0 ? 'Keep it going!' : 'Start practicing to build your streak!';

  const cardBg = isDark ? '#1e1e1e' : '#f5f5f5';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="Insights" />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Hero Stats */}
        <View style={styles.statsRow}>
          <StatCard
            value={stats.versesMastered}
            label="Verses Mastered"
            icon="checkmark.circle.fill"
            iconBgColor="rgba(34,197,94,0.15)"
            iconColor="#22c55e"
          />
          <StatCard
            value={stats.inProgress}
            label="Verses In Progress"
            icon="clock.fill"
            iconBgColor="rgba(59,130,246,0.15)"
            iconColor="#3b82f6"
          />
        </View>

        {/* Practice Streak */}
        <View style={[styles.streakCard, { backgroundColor: cardBg }]}>
          <View style={[styles.streakIconContainer, { backgroundColor: streakBg }]}>
            <IconSymbol name={streakIcon as any} size={32} color={streakColor} />
          </View>
          <View style={styles.streakInfo}>
            <Text style={[styles.streakLabel, { color: colors.icon }]}>Practice Streak</Text>
            <Text style={[styles.streakValue, { color: colors.text }]}>
              {streak} {streak === 1 ? 'day' : 'days'}
            </Text>
            <Text style={[styles.streakMessage, { color: colors.icon }]}>{streakMessage}</Text>
          </View>
        </View>

        {/* Most Memorized Books */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.icon }]}>MOST MEMORIZED BOOKS</Text>
          <View style={[styles.booksList, { backgroundColor: cardBg }]}>
            {topBooks.length > 0 ? (
              topBooks.map((book, index) => (
                <View
                  key={book.name}
                  style={[
                    styles.bookItem,
                    index < topBooks.length - 1 && styles.bookItemBorder,
                    { borderBottomColor: isDark ? '#333' : '#e5e5e5' },
                  ]}
                >
                  <View style={styles.bookInfo}>
                    <View style={[styles.bookIcon, { backgroundColor: isDark ? '#333' : '#e5e5e5' }]}>
                      <IconSymbol name="book.fill" size={18} color={colors.icon} />
                    </View>
                    <Text style={[styles.bookName, { color: colors.text }]}>{book.name}</Text>
                  </View>
                  <Text style={[styles.bookCount, { color: colors.icon }]}>({book.count})</Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyBooks}>
                <Text style={[styles.emptyText, { color: colors.icon }]}>No verses memorized yet</Text>
                <Text style={[styles.emptySubtext, { color: colors.icon }]}>
                  Start practicing to see your progress!
                </Text>
              </View>
            )}
          </View>
        </View>
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
  content: {
    padding: 16,
    gap: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    gap: 6,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 13,
  },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 12,
    gap: 16,
  },
  streakIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  streakInfo: {
    flex: 1,
    gap: 4,
  },
  streakLabel: {
    fontSize: 13,
  },
  streakValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  streakMessage: {
    fontSize: 13,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  booksList: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  bookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  bookItemBorder: {
    borderBottomWidth: 1,
  },
  bookInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bookIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookName: {
    fontSize: 16,
    fontWeight: '500',
  },
  bookCount: {
    fontSize: 15,
  },
  emptyBooks: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 4,
  },
});

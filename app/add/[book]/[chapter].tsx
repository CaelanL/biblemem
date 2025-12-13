import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { normalizeBookName } from '@/lib/bible';
import { saveVerse } from '@/lib/storage';
import bibleData from '@/assets/bible/esv.json';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  type LayoutRectangle,
  type NativeTouchEvent,
  type GestureResponderEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';

type BibleData = Record<string, Record<string, Record<string, string>>>;
const bible = bibleData as BibleData;

interface VerseLayout {
  verseNum: number;
  top: number;
  bottom: number;
}

export default function VerseSelectScreen() {
  const { book, chapter } = useLocalSearchParams<{ book: string; chapter: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';

  const bookName = normalizeBookName(decodeURIComponent(book ?? ''));
  const chapterNum = parseInt(chapter ?? '1', 10);
  const chapterData = bible[bookName]?.[String(chapterNum)] ?? {};
  const verses = Object.entries(chapterData).sort(
    ([a], [b]) => parseInt(a, 10) - parseInt(b, 10)
  );

  // Selection state
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // Layout tracking
  const verseLayouts = useRef<VerseLayout[]>([]);
  const scrollOffset = useRef(0);
  const scrollViewPageY = useRef(0); // ScrollView's position on screen
  const scrollViewRef = useRef<ScrollView>(null);

  // Long press timer
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  const hasSelection = selectionStart !== null && selectionEnd !== null;

  const isVerseSelected = (verseNum: number) => {
    if (!hasSelection) return false;
    const min = Math.min(selectionStart!, selectionEnd!);
    const max = Math.max(selectionStart!, selectionEnd!);
    return verseNum >= min && verseNum <= max;
  };

  // Convert touch Y to verse number
  const getVerseAtY = useCallback((pageY: number): number | null => {
    // pageY is absolute screen position
    // scrollViewPageY is where ScrollView starts on screen
    // scrollOffset is how far we've scrolled
    // verse layouts are relative to scroll content (versesContainer which has padding)

    const relativeY = pageY - scrollViewPageY.current + scrollOffset.current - 16; // 16 = versesContainer padding

    for (const layout of verseLayouts.current) {
      if (relativeY >= layout.top && relativeY <= layout.bottom) {
        return layout.verseNum;
      }
    }

    // If above all verses, return first
    if (verseLayouts.current.length > 0 && relativeY < verseLayouts.current[0].top) {
      return verseLayouts.current[0].verseNum;
    }

    // If below all verses, return last
    if (verseLayouts.current.length > 0) {
      const last = verseLayouts.current[verseLayouts.current.length - 1];
      if (relativeY > last.bottom) {
        return last.verseNum;
      }
    }

    return null;
  }, []);

  const handleVerseLayout = (verseNum: number, layout: LayoutRectangle) => {
    // Remove old entry if exists
    verseLayouts.current = verseLayouts.current.filter(v => v.verseNum !== verseNum);
    // Add new entry
    verseLayouts.current.push({
      verseNum,
      top: layout.y,
      bottom: layout.y + layout.height,
    });
    // Keep sorted
    verseLayouts.current.sort((a, b) => a.verseNum - b.verseNum);
  };

  const handleScroll = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    scrollOffset.current = e.nativeEvent.contentOffset.y;
  };

  const handleScrollViewLayout = () => {
    // Measure ScrollView's position on screen using ref
    if (scrollViewRef.current) {
      (scrollViewRef.current as any).measure?.(
        (_x: number, _y: number, _width: number, _height: number, _pageX: number, pageY: number) => {
          scrollViewPageY.current = pageY;
        }
      );
    }
  };

  // ============ TOUCH HANDLING (Parent owns all touches) ============

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchStart = (e: GestureResponderEvent) => {
    const { pageY } = e.nativeEvent;
    touchStartY.current = pageY;
    touchStartTime.current = Date.now();

    // Start long press timer for drag mode
    clearLongPressTimer();
    longPressTimer.current = setTimeout(() => {
      const verse = getVerseAtY(pageY);
      if (verse !== null) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsSelecting(true);
        setSelectionStart(verse);
        setSelectionEnd(verse);
      }
    }, 250); // 250ms long press
  };

  const handleTouchMove = (e: GestureResponderEvent) => {
    const { pageY } = e.nativeEvent;

    // Cancel long press if moved too much before it fired
    if (!isSelecting && Math.abs(pageY - touchStartY.current) > 10) {
      clearLongPressTimer();
      return;
    }

    // If we're selecting, update selection end
    if (isSelecting) {
      const verse = getVerseAtY(pageY);
      if (verse !== null && verse !== selectionEnd) {
        Haptics.selectionAsync();
        setSelectionEnd(verse);
      }
    }
  };

  const handleTouchEnd = (e: GestureResponderEvent) => {
    const { pageY } = e.nativeEvent;
    const touchDuration = Date.now() - touchStartTime.current;
    const touchDistance = Math.abs(pageY - touchStartY.current);

    clearLongPressTimer();

    // If it was a quick tap (not a long press or drag)
    if (touchDuration < 250 && touchDistance < 10) {
      if (hasSelection) {
        // Clear selection on tap
        setSelectionStart(null);
        setSelectionEnd(null);
      } else {
        // Tap to select single verse
        const verse = getVerseAtY(pageY);
        if (verse !== null) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setSelectionStart(verse);
          setSelectionEnd(verse);
        }
      }
    }

    setIsSelecting(false);
  };

  // Responder methods - claim touches for this view
  const handleStartShouldSetResponder = () => true;
  const handleMoveShouldSetResponder = () => isSelecting;

  // ============ ACTIONS ============

  const handleAddVerses = async () => {
    if (!hasSelection) return;

    const min = Math.min(selectionStart!, selectionEnd!);
    const max = Math.max(selectionStart!, selectionEnd!);

    const texts: string[] = [];
    for (let v = min; v <= max; v++) {
      const text = chapterData[String(v)];
      if (text) texts.push(text);
    }

    await saveVerse({
      book: bookName,
      chapter: chapterNum,
      verseStart: min,
      verseEnd: max,
      text: texts.join(' '),
    });

    router.dismissAll();
    router.replace('/');
  };

  // ============ RENDER ============

  const min = hasSelection ? Math.min(selectionStart!, selectionEnd!) : null;
  const max = hasSelection ? Math.max(selectionStart!, selectionEnd!) : null;

  const buttonText = min !== null && max !== null
    ? min === max
      ? `Add Verse ${min}`
      : `Add Verses ${min}-${max}`
    : '';

  const highlightBg = isDark ? 'rgba(96, 165, 250, 0.35)' : 'rgba(10, 126, 164, 0.25)';
  const buttonBg = isDark ? '#3b82f6' : '#0a7ea4';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: `${bookName} ${chapterNum}`,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      <View
        style={styles.touchContainer}
        onStartShouldSetResponder={handleStartShouldSetResponder}
        onMoveShouldSetResponder={handleMoveShouldSetResponder}
        onResponderGrant={handleTouchStart}
        onResponderMove={handleTouchMove}
        onResponderRelease={handleTouchEnd}
        onResponderTerminate={handleTouchEnd}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          onScroll={handleScroll}
          onLayout={handleScrollViewLayout}
          scrollEventThrottle={16}
          scrollEnabled={!isSelecting}
        >
          <View style={styles.versesContainer}>
            {verses.map(([verseNum, text]) => {
              const num = parseInt(verseNum, 10);
              const selected = isVerseSelected(num);

              return (
                <View
                  key={verseNum}
                  onLayout={(e) => handleVerseLayout(num, e.nativeEvent.layout)}
                  style={[
                    styles.verseWrapper,
                    selected && { backgroundColor: highlightBg },
                  ]}
                >
                  <Text style={[styles.verseText, { color: colors.text }]}>
                    <Text style={[styles.verseNumber, { color: isDark ? '#60a5fa' : colors.tint }]}>
                      {verseNum}
                    </Text>
                    {'  '}
                    {text}
                  </Text>
                </View>
              );
            })}
          </View>
          <View style={styles.bottomPadding} />
        </ScrollView>
      </View>

      {hasSelection && (
        <View
          style={[
            styles.bottomBar,
            { backgroundColor: colors.background, borderTopColor: colors.icon + '30' },
          ]}
        >
          <Pressable
            style={[styles.addButton, { backgroundColor: buttonBg }]}
            onPress={handleAddVerses}
          >
            <Text style={styles.addButtonText}>{buttonText}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  touchContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  versesContainer: {
    padding: 16,
  },
  verseWrapper: {
    borderRadius: 4,
    marginVertical: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  verseText: {
    fontSize: 18,
    lineHeight: 28,
  },
  verseNumber: {
    fontSize: 12,
    fontWeight: '700',
  },
  bottomPadding: {
    height: 120,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 40,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});

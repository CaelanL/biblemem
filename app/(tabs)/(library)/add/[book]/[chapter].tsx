import { AppHeader } from '@/components/app-header';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { normalizeBookName } from '@/lib/bible';
import { type BibleVersion } from '@/lib/storage';
import { syncSaveVerse } from '@/lib/sync';
import { useSettings } from '@/lib/settings';
import { fetchVerse } from '@/lib/api';
import bibleData from '@/assets/bible/esv.json';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Alert,
  ActivityIndicator,
  Modal,
  type LayoutRectangle,
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
  const { book, chapter, collectionId, version } = useLocalSearchParams<{
    book: string;
    chapter: string;
    collectionId?: string;
    version?: string;
  }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const { settings } = useSettings();

  const bookName = normalizeBookName(decodeURIComponent(book ?? ''));
  const chapterNum = parseInt(chapter ?? '1', 10);
  const chapterData = bible[bookName]?.[String(chapterNum)] ?? {};
  const verses = Object.entries(chapterData).sort(
    ([a], [b]) => parseInt(a, 10) - parseInt(b, 10)
  );

  // Translation from URL param (passed from book selection), fallback to settings
  const initialVersion = (version === 'ESV' || version === 'NLT') ? version : settings.bibleVersion;
  const [selectedVersion, setSelectedVersion] = useState<BibleVersion>(initialVersion);
  const [versionPickerVisible, setVersionPickerVisible] = useState(false);

  // Selection state
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Layout tracking
  const verseLayouts = useRef<VerseLayout[]>([]);
  const scrollOffset = useRef(0);
  const scrollViewPageY = useRef(0);
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

  const getVerseAtY = useCallback((pageY: number): number | null => {
    const relativeY = pageY - scrollViewPageY.current + scrollOffset.current - 16;

    for (const layout of verseLayouts.current) {
      if (relativeY >= layout.top && relativeY <= layout.bottom) {
        return layout.verseNum;
      }
    }

    if (verseLayouts.current.length > 0 && relativeY < verseLayouts.current[0].top) {
      return verseLayouts.current[0].verseNum;
    }

    if (verseLayouts.current.length > 0) {
      const last = verseLayouts.current[verseLayouts.current.length - 1];
      if (relativeY > last.bottom) {
        return last.verseNum;
      }
    }

    return null;
  }, []);

  const handleVerseLayout = (verseNum: number, layout: LayoutRectangle) => {
    verseLayouts.current = verseLayouts.current.filter(v => v.verseNum !== verseNum);
    verseLayouts.current.push({
      verseNum,
      top: layout.y,
      bottom: layout.y + layout.height,
    });
    verseLayouts.current.sort((a, b) => a.verseNum - b.verseNum);
  };

  const handleScroll = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    scrollOffset.current = e.nativeEvent.contentOffset.y;
  };

  const handleScrollViewLayout = () => {
    if (scrollViewRef.current) {
      (scrollViewRef.current as any).measure?.(
        (_x: number, _y: number, _width: number, _height: number, _pageX: number, pageY: number) => {
          scrollViewPageY.current = pageY;
        }
      );
    }
  };

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

    clearLongPressTimer();
    longPressTimer.current = setTimeout(() => {
      const verse = getVerseAtY(pageY);
      if (verse !== null) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsSelecting(true);
        setSelectionStart(verse);
        setSelectionEnd(verse);
      }
    }, 250);
  };

  const handleTouchMove = (e: GestureResponderEvent) => {
    const { pageY } = e.nativeEvent;

    if (!isSelecting && Math.abs(pageY - touchStartY.current) > 10) {
      clearLongPressTimer();
      return;
    }

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

    if (touchDuration < 250 && touchDistance < 10) {
      if (hasSelection) {
        setSelectionStart(null);
        setSelectionEnd(null);
      } else {
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

  const handleStartShouldSetResponder = () => true;
  const handleMoveShouldSetResponder = () => isSelecting;

  const handleAddVerses = async () => {
    if (!hasSelection || isSaving) return;

    const min = Math.min(selectionStart!, selectionEnd!);
    const max = Math.max(selectionStart!, selectionEnd!);

    setIsSaving(true);

    try {
      const reference = min === max
        ? `${bookName} ${chapterNum}:${min}`
        : `${bookName} ${chapterNum}:${min}-${max}`;

      const { text } = await fetchVerse(reference, selectedVersion);

      await syncSaveVerse({
        book: bookName,
        chapter: chapterNum,
        verseStart: min,
        verseEnd: max,
        text,
      }, collectionId, selectedVersion);

      // Navigate back to collection or library
      if (collectionId) {
        router.navigate(`/(tabs)/(library)/${collectionId}`);
      } else {
        router.navigate('/(tabs)/(library)');
      }
    } catch (error) {
      console.error('Failed to add verses:', error);
      Alert.alert('Error', `Failed to add verses: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  const min = hasSelection ? Math.min(selectionStart!, selectionEnd!) : null;
  const max = hasSelection ? Math.max(selectionStart!, selectionEnd!) : null;

  const buttonText = min !== null && max !== null
    ? min === max
      ? `Add Verse ${min}`
      : `Add Verses ${min}-${max}`
    : '';

  const highlightBg = isDark ? 'rgba(96, 165, 250, 0.35)' : 'rgba(10, 126, 164, 0.25)';
  const buttonBg = isDark ? '#3b82f6' : '#0a7ea4';

  const handleVersionSelect = (ver: BibleVersion) => {
    Haptics.selectionAsync();
    setSelectedVersion(ver);
    setVersionPickerVisible(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        title={`${bookName} ${chapterNum}`}
        rightButton={{
          label: selectedVersion,
          onPress: () => setVersionPickerVisible(true),
          variant: 'text',
        }}
      />

      {/* Version Picker Modal */}
      <Modal
        visible={versionPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setVersionPickerVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setVersionPickerVisible(false)}
        >
          <View style={[styles.pickerContainer, { backgroundColor: isDark ? '#2c2c2e' : '#fff' }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Translation</Text>
            {(['ESV', 'NLT'] as BibleVersion[]).map((ver) => (
              <Pressable
                key={ver}
                style={[
                  styles.pickerOption,
                  selectedVersion === ver && { backgroundColor: isDark ? '#0a84ff' : '#007aff' },
                ]}
                onPress={() => handleVersionSelect(ver)}
              >
                <Text
                  style={[
                    styles.pickerOptionText,
                    { color: selectedVersion === ver ? '#fff' : colors.text },
                  ]}
                >
                  {ver}
                </Text>
                <Text
                  style={[
                    styles.pickerOptionSubtext,
                    { color: selectedVersion === ver ? 'rgba(255,255,255,0.7)' : colors.icon },
                  ]}
                >
                  {ver === 'ESV' ? 'English Standard Version' : 'New Living Translation'}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

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
            style={[styles.addButton, { backgroundColor: buttonBg, opacity: isSaving ? 0.7 : 1 }]}
            onPress={handleAddVerses}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.addButtonText}>{buttonText}</Text>
            )}
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    width: '80%',
    maxWidth: 300,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  pickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 6,
  },
  pickerOptionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  pickerOptionSubtext: {
    fontSize: 12,
    marginTop: 2,
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

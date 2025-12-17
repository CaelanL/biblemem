import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { evaluateRecitation, type AlignmentWord } from '@/lib/evaluate';
import { formatVerseReference, getSavedVerses, updateVerseProgress, type SavedVerse, type Difficulty as StorageDifficulty } from '@/lib/storage';
import { transcribeAudio } from '@/lib/whisper';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  runOnJS,
  Easing,
  FadeIn,
  SlideInUp,
  Layout,
} from 'react-native-reanimated';

type Difficulty = 'easy' | 'medium' | 'hard';
type RecordingState = 'idle' | 'recording';

interface Chunk {
  verseNum: number;
  verseNumEnd?: number; // For multi-verse chunks
  text: string;
  displayText: string; // May have blanks for medium mode
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_MAX_HEIGHT = SCREEN_HEIGHT * 0.30;
// ScrollView max height = card max - badge (~28) - badge margin (16) - padding top (20) - padding bottom (20)
const SCROLL_MAX_HEIGHT = CARD_MAX_HEIGHT - 28 - 16 - 20 - 20;
const RECORDING_BAR_HEIGHT = 56;
const WAVEFORM_SAMPLES = 40;

// Isolated waveform component - only re-renders when trigger changes
const Waveform = React.memo(({ dataRef, trigger }: { dataRef: React.MutableRefObject<number[]>; trigger: number }) => {
  return (
    <View style={waveformStyles.container}>
      {Array.from({ length: WAVEFORM_SAMPLES }).map((_, i) => {
        const dataIndex = dataRef.current.length - (WAVEFORM_SAMPLES - i);
        const level = dataIndex >= 0 ? dataRef.current[dataIndex] : 0;
        const baseHeight = 2;
        const maxHeight = 28;
        const curved = Math.pow(level, 0.6);
        const height = baseHeight + (maxHeight - baseHeight) * curved;
        return (
          <View
            key={i}
            style={[waveformStyles.bar, { height }]}
          />
        );
      })}
    </View>
  );
});

const waveformStyles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 1.5,
    height: 32,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  bar: {
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 1,
    minHeight: 3,
  },
});

export default function StudySessionScreen() {
  const { id, difficulty, chunkSize: chunkSizeParam } = useLocalSearchParams<{ id: string; difficulty: Difficulty; chunkSize: string }>();
  const chunkSize = parseInt(chunkSizeParam ?? '1', 10);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';

  const [verse, setVerse] = useState<SavedVerse | null>(null);
  const [loading, setLoading] = useState(true);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [completedChunks, setCompletedChunks] = useState<Set<number>>(new Set());
  const [chunkScores, setChunkScores] = useState<Map<number, number>>(new Map()); // index -> score (0 or 100)
  const [chunkTranscriptions, setChunkTranscriptions] = useState<Map<number, string>>(new Map()); // index -> transcription
  const [chunkAlignments, setChunkAlignments] = useState<Map<number, AlignmentWord[]>>(new Map()); // index -> alignment
  const [transcribing, setTranscribing] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const meteringRef = useRef<NodeJS.Timeout | null>(null);
  const waveformDataRef = useRef<number[]>([]); // Store waveform data without causing re-renders
  const [waveformTrigger, setWaveformTrigger] = useState(0); // Trigger for waveform re-render only

  // Animation: recording bar slides up from bottom
  const recordingTabY = useSharedValue(RECORDING_BAR_HEIGHT + 60); // Start hidden (below screen)
  const spinnerRotation = useSharedValue(0);

  const recordingTabStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: recordingTabY.value }],
  }));

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinnerRotation.value}deg` }],
  }));

  // Start/stop spinner when transcribing
  useEffect(() => {
    if (transcribing) {
      spinnerRotation.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1, // infinite
        false
      );
    } else {
      spinnerRotation.value = 0;
    }
  }, [transcribing]);

  useEffect(() => {
    loadVerse();

    // Cleanup recording and timer on unmount
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
      if (meteringRef.current) {
        clearInterval(meteringRef.current);
        meteringRef.current = null;
      }
    };
  }, [id]);

  const loadVerse = async () => {
    const verses = await getSavedVerses();
    const found = verses.find((v) => v.id === id);
    if (found) {
      setVerse(found);
      const parsedChunks = parseVerseIntoChunks(found, difficulty ?? 'easy', chunkSize);
      setChunks(parsedChunks);
    }
    setLoading(false);
  };

  // Convert number to superscript characters
  const toSuperscript = (num: number): string => {
    const superscripts: Record<string, string> = {
      '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
      '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    };
    return String(num).split('').map(d => superscripts[d]).join('');
  };

  // Add verse number annotation to text
  const annotateWithVerseNum = (text: string, verseNum: number): string => {
    return `${toSuperscript(verseNum)}${text}`;
  };

  const parseVerseIntoChunks = (verse: SavedVerse, diff: Difficulty, size: number): Chunk[] => {
    const totalVerses = verse.verseEnd - verse.verseStart + 1;

    // If only one verse, return single chunk
    if (totalVerses === 1) {
      const annotatedText = annotateWithVerseNum(verse.text, verse.verseStart);
      return [{
        verseNum: verse.verseStart,
        text: verse.text,
        displayText: applyDifficulty(annotatedText, diff),
      }];
    }

    // If chunkSize >= totalVerses, return all verses as one chunk
    if (size >= totalVerses) {
      // Need to split and annotate each verse, then rejoin
      const annotatedText = annotateVerseRange(verse.text, verse.verseStart, totalVerses);
      return [{
        verseNum: verse.verseStart,
        verseNumEnd: verse.verseEnd,
        text: verse.text,
        displayText: applyDifficulty(annotatedText, diff),
      }];
    }

    // Get individual verse texts
    const verseTexts: { verseNum: number; text: string }[] = [];
    for (let v = verse.verseStart; v <= verse.verseEnd; v++) {
      const verseText = getVerseText(verse.text, v - verse.verseStart, totalVerses);
      verseTexts.push({ verseNum: v, text: verseText });
    }

    // Group verses into chunks based on chunkSize
    const chunks: Chunk[] = [];
    for (let i = 0; i < verseTexts.length; i += size) {
      const chunkVerses = verseTexts.slice(i, i + size);
      const combinedText = chunkVerses.map(v => v.text).join(' ');
      // Annotate each verse in the chunk
      const annotatedText = chunkVerses
        .map(v => annotateWithVerseNum(v.text, v.verseNum))
        .join(' ');
      const startVerse = chunkVerses[0].verseNum;
      const endVerse = chunkVerses[chunkVerses.length - 1].verseNum;

      chunks.push({
        verseNum: startVerse,
        verseNumEnd: endVerse !== startVerse ? endVerse : undefined,
        text: combinedText,
        displayText: applyDifficulty(annotatedText, diff),
      });
    }

    return chunks;
  };

  // Annotate a full verse range (for when all verses are in one chunk)
  const annotateVerseRange = (fullText: string, startVerse: number, totalVerses: number): string => {
    const parts: string[] = [];
    for (let i = 0; i < totalVerses; i++) {
      const verseText = getVerseText(fullText, i, totalVerses);
      parts.push(annotateWithVerseNum(verseText, startVerse + i));
    }
    return parts.join(' ');
  };

  // Simplified verse text extraction (splits evenly for now)
  const getVerseText = (fullText: string, index: number, total: number): string => {
    if (total === 1) return fullText;

    // Try to split by sentence-like boundaries
    const sentences = fullText.split(/(?<=[.!?])\s+/);
    if (sentences.length >= total) {
      return sentences[index] || fullText;
    }

    // Fallback: split by words
    const words = fullText.split(' ');
    const chunkSize = Math.ceil(words.length / total);
    const start = index * chunkSize;
    const end = start + chunkSize;
    return words.slice(start, end).join(' ');
  };

  const applyDifficulty = (text: string, diff: Difficulty): string => {
    if (diff === 'easy') return text;
    if (diff === 'hard') return '';

    // Medium: blank out ~50% of words, avoid consecutive blanks
    const words = text.split(' ');
    let lastBlanked = false;

    return words.map((word, i) => {
      // Don't blank if last word was blanked (avoid consecutive)
      if (lastBlanked) {
        lastBlanked = false;
        return word;
      }

      // ~50% chance to blank, but not first or last word
      if (i > 0 && i < words.length - 1 && Math.random() < 0.5) {
        lastBlanked = true;
        // Replace with underscores matching length
        return '_'.repeat(word.replace(/[^a-zA-Z]/g, '').length) +
               word.replace(/[a-zA-Z]/g, '').slice(-1); // Keep trailing punctuation
      }

      return word;
    }).join(' ');
  };

  const handleMicPress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Request permissions
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission required', 'Please allow microphone access to record.');
        return;
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Start recording
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;

      // Animate recording bar up
      recordingTabY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });

      // Start audio level metering - builds scrolling waveform
      waveformDataRef.current = [];
      setWaveformTrigger(0);
      meteringRef.current = setInterval(async () => {
        if (recordingRef.current) {
          const status = await recordingRef.current.getStatusAsync();
          if (status.isRecording && typeof status.metering === 'number') {
            // Based on testing: silence ~-26dB, talking ~-7 to -13dB
            const minDb = -26; // silence floor
            const maxDb = -6;  // loud speech
            const normalized = Math.max(0, Math.min(1, (status.metering - minDb) / (maxDb - minDb)));

            // Add new sample to ref
            waveformDataRef.current.push(normalized);
            if (waveformDataRef.current.length > WAVEFORM_SAMPLES) {
              waveformDataRef.current = waveformDataRef.current.slice(-WAVEFORM_SAMPLES);
            }
            // Trigger waveform component re-render only
            setWaveformTrigger(t => t + 1);
          }
        }
      }, 50); // ~20 samples per second

      setRecordingState('recording');
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const handleCancel = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Stop metering
    if (meteringRef.current) {
      clearInterval(meteringRef.current);
      meteringRef.current = null;
    }
    waveformDataRef.current = [];

    // Animate bar down
    recordingTabY.value = withTiming(RECORDING_BAR_HEIGHT + 60, { duration: 250, easing: Easing.in(Easing.cubic) });

    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
    } catch (error) {
      console.error('Failed to cancel recording:', error);
    }

    setRecordingState('idle');
  };

  const handleSubmit = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Stop metering
    if (meteringRef.current) {
      clearInterval(meteringRef.current);
      meteringRef.current = null;
    }
    waveformDataRef.current = [];

    if (!recordingRef.current) {
      setRecordingState('idle');
      return;
    }

    try {
      setTranscribing(true);
      // Keep bar up during processing - it will slide down after we get results

      // Stop recording and get URI
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        throw new Error('No recording URI');
      }

      // Transcribe with Whisper
      const transcription = await transcribeAudio(uri);

      // Get actual verse text for this chunk
      const currentChunk = chunks[currentIndex];
      const actualText = currentChunk.text;

      // Evaluate with LLM (also cleans transcription and provides alignment)
      const { cleanedTranscription, alignment } = await evaluateRecitation(actualText, transcription);

      // Calculate score from alignment
      let correct = 0, close = 0, wrong = 0, missing = 0, added = 0;
      for (const item of alignment) {
        if (item.status === 'correct') correct++;
        else if (item.status === 'close') close++;
        else if (item.status === 'wrong') wrong++;
        else if (item.status === 'missing') missing++;
        else if (item.status === 'added') added++;
      }
      const denominator = correct + close + wrong + missing + added;
      const score = denominator > 0 ? Math.round((correct + close * 0.5) / denominator * 100) : 0;

      // Store score, cleaned transcription, and alignment
      setChunkScores((prev) => new Map(prev).set(currentIndex, score));
      setChunkTranscriptions((prev) => new Map(prev).set(currentIndex, cleanedTranscription));
      setChunkAlignments((prev) => new Map(prev).set(currentIndex, alignment));

      // Mark as completed
      const newCompleted = new Set([...completedChunks, currentIndex]);
      setCompletedChunks(newCompleted);
      setRecordingState('idle');

      // Slide the tab down, then clear transcribing state after animation completes
      recordingTabY.value = withTiming(
        RECORDING_BAR_HEIGHT + 60,
        { duration: 250, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) {
            runOnJS(setTranscribing)(false);
          }
        }
      );

      // Check if all chunks are done
      if (newCompleted.size === chunks.length) {
        // Calculate final score from ALL alignments across all chunks
        const allAlignments = new Map(chunkAlignments).set(currentIndex, alignment);
        let totalCorrect = 0, totalClose = 0, totalWrong = 0, totalMissing = 0, totalAdded = 0;
        allAlignments.forEach((align) => {
          for (const item of align) {
            if (item.status === 'correct') totalCorrect++;
            else if (item.status === 'close') totalClose++;
            else if (item.status === 'wrong') totalWrong++;
            else if (item.status === 'missing') totalMissing++;
            else if (item.status === 'added') totalAdded++;
          }
        });
        const totalDenom = totalCorrect + totalClose + totalWrong + totalMissing + totalAdded;
        const finalScore = totalDenom > 0 ? Math.round((totalCorrect + totalClose * 0.5) / totalDenom * 100) : 0;

        // Update progress in storage
        if (id && difficulty) {
          updateVerseProgress(id, difficulty as StorageDifficulty, finalScore);
        }

        setShowResults(true);
      }
    } catch (error) {
      console.error('Transcription failed:', error);
      // Slide tab down on error, then clear transcribing state
      recordingTabY.value = withTiming(
        RECORDING_BAR_HEIGHT + 60,
        { duration: 250, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) {
            runOnJS(setTranscribing)(false);
          }
        }
      );
      Alert.alert('Error', `Transcription failed: ${error}`);
      setRecordingState('idle');
    }
  };

  const handleNext = () => {
    // Find next incomplete chunk
    for (let i = 0; i < chunks.length; i++) {
      if (!completedChunks.has(i)) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCurrentIndex(i);
        setRecordingState('idle');
        flatListRef.current?.scrollToIndex({ index: i, animated: true });
        return;
      }
    }
    // All done - go to results
    setShowResults(true);
    flatListRef.current?.scrollToIndex({ index: chunks.length, animated: true });
  };

  const calculateFinalScore = (): number => {
    if (chunkAlignments.size === 0) return 0;
    let totalCorrect = 0, totalClose = 0, totalWrong = 0, totalMissing = 0, totalAdded = 0;
    chunkAlignments.forEach((align) => {
      for (const item of align) {
        if (item.status === 'correct') totalCorrect++;
        else if (item.status === 'close') totalClose++;
        else if (item.status === 'wrong') totalWrong++;
        else if (item.status === 'missing') totalMissing++;
        else if (item.status === 'added') totalAdded++;
      }
    });
    const totalDenom = totalCorrect + totalClose + totalWrong + totalMissing + totalAdded;
    return totalDenom > 0 ? Math.round((totalCorrect + totalClose * 0.5) / totalDenom * 100) : 0;
  };

  const handleViewResults = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    flatListRef.current?.scrollToIndex({ index: 0, animated: true });
    setCurrentIndex(0);
  };

  const handleDone = () => {
    router.back();
  };

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const index = viewableItems[0].index;
      if (index !== null && index !== currentIndex) {
        // Cancel any active recording when scrolling away
        if (recordingRef.current) {
          recordingRef.current.stopAndUnloadAsync().catch(() => {});
          recordingRef.current = null;
          setRecordingState('idle');
        }
        setCurrentIndex(index);
      }
    }
  }, [currentIndex]);

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
  };

  const buttonBg = isDark ? '#3b82f6' : '#0a7ea4';

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (!verse || chunks.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Something went wrong</Text>
      </View>
    );
  }

  // Data for FlatList: chunks + results page (only show results when all done)
  const allChunksCompleted = completedChunks.size === chunks.length && chunks.length > 0;
  const listData = allChunksCompleted
    ? [...chunks, { isResultsPage: true }] as (Chunk | { isResultsPage: true })[]
    : chunks;

  const renderItem = ({ item, index }: { item: Chunk | { isResultsPage: true }; index: number }) => {
    // Results page
    if ('isResultsPage' in item) {
      const finalScore = calculateFinalScore();
      const passed = finalScore >= 90;

      return (
        <View style={[styles.chunkContainer, { width: SCREEN_WIDTH }]}>
          <View style={styles.resultsContent}>
            <Text style={[styles.resultsTitle, { color: colors.text }]}>Session Complete</Text>

            <View style={[styles.scoreCircle, { borderColor: passed ? '#22c55e' : '#ef4444' }]}>
              <Text style={[styles.scoreText, { color: passed ? '#22c55e' : '#ef4444' }]}>
                {finalScore}%
              </Text>
            </View>

            <Text style={[styles.scoreLabel, { color: colors.icon }]}>
              {passed ? 'Great job! You passed!' : 'Keep practicing!'}
            </Text>

            <View style={styles.resultsButtons}>
              <Pressable
                style={[styles.resultsButton, { backgroundColor: isDark ? '#374151' : '#e5e5e5' }]}
                onPress={handleViewResults}
              >
                <Text style={[styles.resultsButtonText, { color: colors.text }]}>View Results</Text>
              </Pressable>

              <Pressable
                style={[styles.resultsButton, { backgroundColor: buttonBg }]}
                onPress={handleDone}
              >
                <Text style={[styles.resultsButtonText, { color: '#fff' }]}>Done</Text>
              </Pressable>
            </View>
          </View>
          {/* Empty placeholder to match chunk layout */}
          <View style={styles.controlsContainer} />
        </View>
      );
    }

    // Regular chunk
    const isCompleted = completedChunks.has(index);
    const score = chunkScores.get(index);
    const transcription = chunkTranscriptions.get(index);
    const alignment = chunkAlignments.get(index);

    // Render alignment with colors
    const renderAlignment = (align: AlignmentWord[]) => {
      return (
        <Text style={styles.alignmentContainer}>
          {align.map((item, i) => {
            let color = colors.text; // default/correct
            if (item.status === 'wrong' || item.status === 'missing') {
              color = '#ef4444'; // red
            } else if (item.status === 'close') {
              color = '#f59e0b'; // yellow/amber
            } else if (item.status === 'added') {
              color = '#ef4444'; // red for added too
            }
            // correct stays default text color

            return (
              <Text key={i} style={{ color }}>
                {item.word}{i < align.length - 1 ? ' ' : ''}
              </Text>
            );
          })}
        </Text>
      );
    };

    // Build verse label
    const getVerseLabel = () => {
      if (verse.verseStart === verse.verseEnd) {
        return formatVerseReference(verse);
      } else if (item.verseNumEnd) {
        return `Verses ${item.verseNum}-${item.verseNumEnd}`;
      } else {
        return `Verse ${item.verseNum}`;
      }
    };

    const cardBg = isDark ? '#1c1c1e' : '#ffffff';

    return (
      <View style={[styles.chunkContainer, { width: SCREEN_WIDTH }]}>
        {/* Cards container */}
        <View style={styles.cardsArea}>
          {/* Verse Card */}
          <Animated.View
          style={[
            styles.card,
            styles.cardShadow,
            styles.verseCard,
            { backgroundColor: cardBg, maxHeight: CARD_MAX_HEIGHT, borderColor: isDark ? 'rgba(96,165,250,0.3)' : 'rgba(10,126,164,0.25)' },
          ]}
          layout={Layout.duration(300)}
        >
          <View style={styles.cardContent}>
            {/* Reference Badge */}
            <View style={[styles.referenceBadge, { backgroundColor: isDark ? 'rgba(96,165,250,0.15)' : 'rgba(10,126,164,0.1)' }]}>
              <IconSymbol name="book.fill" size={14} color={isDark ? '#60a5fa' : colors.tint} />
              <Text style={[styles.referenceBadgeText, { color: isDark ? '#60a5fa' : colors.tint }]}>
                {getVerseLabel()}
              </Text>
            </View>

            {/* Verse Text */}
            <ScrollView style={[styles.cardScrollContent, { maxHeight: SCROLL_MAX_HEIGHT }]} contentContainerStyle={styles.verseTextContainer}>
              {difficulty === 'hard' ? (
                <View style={styles.hardModeContainer}>
                  <View style={[styles.hardModeIcon, { backgroundColor: isDark ? 'rgba(96,165,250,0.15)' : 'rgba(10,126,164,0.1)' }]}>
                    <IconSymbol name="lightbulb.fill" size={28} color={isDark ? '#60a5fa' : colors.tint} />
                  </View>
                  <Text style={[styles.hardModeHint, { color: colors.icon }]}>
                    Recite from memory
                  </Text>
                </View>
              ) : (
                <Text style={[styles.chunkText, { color: colors.text }]}>
                  {item.displayText}
                </Text>
              )}
            </ScrollView>
          </View>
        </Animated.View>

        {/* Result Card - only shows after completion */}
        {isCompleted && (() => {
          // Determine status based on score
          const status = score && score >= 90 ? 'success' : score && score >= 70 ? 'partial' : 'retry';
          const statusColors = {
            success: { bg: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.3)', text: '#22c55e', label: 'Perfect!' },
            partial: { bg: isDark ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b', label: 'Good effort!' },
            retry: { bg: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', text: '#ef4444', label: 'Try again' },
          };
          const statusStyle = statusColors[status];
          const statusIcon = status === 'success' ? 'checkmark.circle.fill' : status === 'partial' ? 'checkmark.circle' : 'arrow.clockwise';

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

          return (
            <Animated.View
              style={[
                styles.card,
                styles.resultCard,
                {
                  backgroundColor: statusStyle.bg,
                  borderColor: statusStyle.border,
                  maxHeight: CARD_MAX_HEIGHT,
                },
              ]}
              entering={customEntering}
            >
              <View style={styles.resultCardContent}>
                {/* Header with status */}
                <View style={styles.resultCardHeader}>
                  <View style={styles.resultStatusRow}>
                    <IconSymbol name={statusIcon as any} size={18} color={statusStyle.text} />
                    <Text style={[styles.resultStatusLabel, { color: statusStyle.text }]}>
                      {statusStyle.label}
                    </Text>
                  </View>
                  <View style={[styles.scoreBadge, { backgroundColor: `${statusStyle.text}20` }]}>
                    <Text style={[styles.scoreBadgeText, { color: statusStyle.text }]}>
                      {score}% match
                    </Text>
                  </View>
                </View>

                {/* Transcription/Alignment */}
                <ScrollView style={styles.cardScrollContent} contentContainerStyle={styles.resultScrollInner}>
                  {alignment && alignment.length > 0 ? (
                    renderAlignment(alignment)
                  ) : transcription ? (
                    <Text style={[styles.transcriptionText, { color: colors.text }]}>
                      "{transcription}"
                    </Text>
                  ) : null}
                </ScrollView>
              </View>
            </Animated.View>
          );
        })()}
        </View>

        {/* Controls area - inside each chunk item */}
        <View style={styles.controlsContainer}>
          {recordingState === 'idle' && !transcribing && !isCompleted && currentIndex === index && (
            <Pressable
              style={[styles.micButton, { backgroundColor: buttonBg }]}
              onPress={handleMicPress}
            >
              <IconSymbol name="mic.fill" size={32} color="#fff" />
            </Pressable>
          )}

          {recordingState === 'idle' && !transcribing && isCompleted && currentIndex === index && (
            <Pressable
              style={[styles.nextButton, { backgroundColor: buttonBg }]}
              onPress={handleNext}
            >
              <Text style={styles.nextButtonText}>
                {completedChunks.size === chunks.length ? 'See Results' : 'Next'}
              </Text>
              <IconSymbol name="arrow.right" size={20} color="#fff" />
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: formatVerseReference(verse),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      {/* Progress Bar */}
      <View style={[styles.progressContainer, { backgroundColor: isDark ? '#1e1e1e' : '#e5e5e5' }]}>
        {chunks.map((_, index) => (
          <View
            key={index}
            style={[
              styles.progressSegment,
              {
                backgroundColor: completedChunks.has(index)
                  ? '#22c55e'
                  : index === currentIndex
                  ? buttonBg
                  : 'transparent',
              },
            ]}
          />
        ))}
      </View>

      {/* Swipeable Chunks */}
      <FlatList
        ref={flatListRef}
        data={listData}
        renderItem={renderItem}
        keyExtractor={(_, index) => index.toString()}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={(recordingState === 'idle' && !transcribing) || showResults}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />

      {/* Recording Bar - horizontal bar at bottom */}
      <Animated.View
        style={[
          styles.recordingBar,
          transcribing ? styles.recordingBarProcessing : styles.recordingBarActive,
          recordingTabStyle,
        ]}
      >
        {transcribing ? (
          <View style={styles.processingBarContent}>
            <Animated.View style={[styles.spinner, spinnerStyle]}>
              <View style={styles.spinnerArc} />
            </Animated.View>
            <Text style={styles.processingText}>Analyzing your recitation...</Text>
          </View>
        ) : (
          <View style={styles.recordingBarContent}>
            {/* Cancel button */}
            <Pressable onPress={handleCancel} style={styles.barCancelButton}>
              <IconSymbol name="xmark" size={22} color="rgba(255,255,255,0.8)" />
            </Pressable>

            {/* Scrolling audio waveform - new data appears right, scrolls left */}
            <Waveform dataRef={waveformDataRef} trigger={waveformTrigger} />

            {/* Submit button */}
            <Pressable onPress={handleSubmit} style={styles.barSubmitButton}>
              <IconSymbol name="checkmark" size={24} color="#fff" />
            </Pressable>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBackButton: {
    padding: 8,
    marginLeft: -8,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    flexDirection: 'row',
    height: 4,
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressSegment: {
    flex: 1,
    marginHorizontal: 1,
    borderRadius: 2,
  },
  chunkContainer: {
    flex: 1,
    padding: 16,
  },
  cardsArea: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  verseCard: {
    borderWidth: 1,
  },
  resultCard: {
    borderWidth: 1,
  },
  resultCardContent: {
    padding: 16,
  },
  resultCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  resultStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resultStatusLabel: {
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
  resultScrollInner: {
    paddingBottom: 4,
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
  // Legacy styles for result card (will be updated)
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cardHeaderText: {
    fontSize: 15,
    fontWeight: '600',
  },
  cardScrollInner: {
    padding: 16,
  },
  transcriptionText: {
    fontSize: 16,
    lineHeight: 26,
  },
  alignmentContainer: {
    fontSize: 16,
    lineHeight: 26,
  },
  recordingHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingCardContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
    paddingVertical: 24,
  },
  recordingControlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 20,
    alignItems: 'center',
    minHeight: 132, // 72 (button) + 20 (paddingTop) + 40 (paddingBottom)
  },
  micButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },
  recordingText: {
    fontSize: 16,
    fontWeight: '500',
  },
  recordingBar: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    height: 56,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  recordingBarActive: {
    backgroundColor: '#ef4444',
  },
  recordingBarProcessing: {
    backgroundColor: '#374151',
  },
  recordingBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  barCancelButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  barSubmitButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  spinner: {
    width: 20,
    height: 20,
  },
  spinnerArc: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2.5,
    borderColor: '#9ca3af',
    borderTopColor: 'transparent',
  },
  processingText: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '500',
  },
  recordingTabControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  cancelButton: {
    padding: 12,
  },
  submitButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordedControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 28,
    gap: 8,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  resultsContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  resultsTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  scoreCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 42,
    fontWeight: 'bold',
  },
  scoreLabel: {
    fontSize: 18,
  },
  resultsButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  resultsButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  resultsButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

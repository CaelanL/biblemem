import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getSavedVerses, formatVerseReference, updateVerseProgress, type SavedVerse, type Difficulty as StorageDifficulty } from '@/lib/storage';
import { transcribeAudio } from '@/lib/whisper';
import { evaluateRecitation, type AlignmentWord } from '@/lib/evaluate';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Dimensions,
  FlatList,
  Alert,
  type ViewToken,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';

type Difficulty = 'easy' | 'medium' | 'hard';
type RecordingState = 'idle' | 'recording' | 'recorded';

interface Chunk {
  verseNum: number;
  verseNumEnd?: number; // For multi-verse chunks
  text: string;
  displayText: string; // May have blanks for medium mode
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

  useEffect(() => {
    loadVerse();

    // Cleanup recording on unmount
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
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

      setRecordingState('recording');
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const handleCancel = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

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

    if (!recordingRef.current) {
      setRecordingState('idle');
      return;
    }

    try {
      setTranscribing(true);

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
      setRecordingState('recorded');

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

        // Auto-scroll to results page
        setTimeout(() => {
          setShowResults(true);
          flatListRef.current?.scrollToIndex({ index: chunks.length, animated: true });
        }, 500);
      }
    } catch (error) {
      console.error('Transcription failed:', error);
      Alert.alert('Error', `Transcription failed: ${error}`);
      setRecordingState('idle');
    } finally {
      setTranscribing(false);
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

    return (
      <View style={[styles.chunkContainer, { width: SCREEN_WIDTH }]}>
        <View style={styles.chunkContent}>
          <Text style={[styles.verseNum, { color: isDark ? '#60a5fa' : colors.tint }]}>
            {getVerseLabel()}
          </Text>

          {difficulty === 'hard' ? (
            <Text style={[styles.hardModeHint, { color: colors.icon }]}>
              Recite from memory
            </Text>
          ) : (
            <Text style={[styles.chunkText, { color: colors.text }]}>
              {item.displayText}
            </Text>
          )}

          {isCompleted && (
            <View style={styles.resultContainer}>
              <Text style={[styles.resultText, { color: score === 100 ? '#22c55e' : '#ef4444' }]}>
                {score === 100 ? '✓ Good' : '✗ Needs work'}
              </Text>
              {alignment && alignment.length > 0 ? (
                <View style={styles.alignmentWrapper}>
                  {renderAlignment(alignment)}
                </View>
              ) : transcription ? (
                <Text style={[styles.transcriptionText, { color: colors.icon }]}>
                  "{transcription}"
                </Text>
              ) : null}
            </View>
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

      {/* Controls - hide on results page */}
      {currentIndex < chunks.length && (
        <View style={styles.controlsContainer}>
          {recordingState === 'idle' && !completedChunks.has(currentIndex) && (
            <Pressable
              style={[styles.micButton, { backgroundColor: buttonBg }]}
              onPress={handleMicPress}
            >
              <IconSymbol name="mic.fill" size={32} color="#fff" />
            </Pressable>
          )}

          {recordingState === 'idle' && completedChunks.has(currentIndex) && (
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

          {recordingState === 'recording' && !transcribing && (
            <View style={styles.recordingControls}>
              <Pressable
                style={[styles.controlButton, { backgroundColor: '#ef4444' }]}
                onPress={handleCancel}
              >
                <IconSymbol name="xmark" size={24} color="#fff" />
              </Pressable>

              <View style={styles.recordingIndicator}>
                <View style={[styles.recordingDot, { backgroundColor: '#ef4444' }]} />
                <Text style={[styles.recordingText, { color: colors.text }]}>Recording...</Text>
              </View>

              <Pressable
                style={[styles.controlButton, { backgroundColor: '#22c55e' }]}
                onPress={handleSubmit}
              >
                <IconSymbol name="checkmark" size={24} color="#fff" />
              </Pressable>
            </View>
          )}

          {transcribing && (
            <View style={styles.recordingIndicator}>
              <ActivityIndicator size="small" color={colors.tint} />
              <Text style={[styles.recordingText, { color: colors.text }]}>Transcribing...</Text>
            </View>
          )}

          {recordingState === 'recorded' && (
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
      )}
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  chunkContent: {
    alignItems: 'center',
    maxWidth: '90%',
  },
  verseNum: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
  },
  chunkText: {
    fontSize: 24,
    lineHeight: 36,
    textAlign: 'center',
  },
  hardModeHint: {
    fontSize: 18,
    fontStyle: 'italic',
  },
  resultContainer: {
    marginTop: 20,
  },
  resultText: {
    fontSize: 16,
    fontWeight: '600',
  },
  transcriptionText: {
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  alignmentWrapper: {
    marginTop: 12,
    paddingHorizontal: 20,
  },
  alignmentContainer: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  controlsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 20,
    alignItems: 'center',
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
  },
  recordingText: {
    fontSize: 16,
    fontWeight: '500',
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

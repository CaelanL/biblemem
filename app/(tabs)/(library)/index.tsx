import { IconSymbol } from '@/components/ui/icon-symbol';
import { AddCollectionModal } from '@/components/library/AddCollectionModal';
import { SwipeableCollectionCard } from '@/components/library/SwipeableCollectionCard';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getCollections,
  getCollectionVerseCount,
  type Collection,
} from '@/lib/storage';
import { syncCreateCollection, syncDeleteCollection } from '@/lib/sync';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface CollectionWithCount extends Collection {
  verseCount: number;
}

export default function LibraryScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const [collections, setCollections] = useState<CollectionWithCount[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const loadCollections = useCallback(async () => {
    const colls = await getCollections();
    // Get verse counts for each collection
    const collsWithCounts = await Promise.all(
      colls.map(async (c) => ({
        ...c,
        verseCount: await getCollectionVerseCount(c.id),
      }))
    );
    setCollections(collsWithCounts);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCollections();
    }, [loadCollections])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCollections();
    setRefreshing(false);
  };

  const handleAddCollection = async (name: string) => {
    await syncCreateCollection(name);
    await loadCollections();
  };

  const handleDeleteCollection = async (id: string) => {
    await syncDeleteCollection(id);
    await loadCollections();
  };

  const handleCollectionPress = (collection: Collection) => {
    router.push(`/(tabs)/(library)/${collection.id}`);
  };

  const primaryColor = isDark ? '#60a5fa' : '#0a7ea4';

  const renderEmptyHint = () => (
    <Animated.View
      entering={FadeInDown.delay(400).duration(300)}
      style={styles.hintContainer}
    >
      <Text style={[styles.hintText, { color: colors.icon }]}>
        Create collections to organize your verses by theme, book, or study plan.
      </Text>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Library</Text>
        <Pressable
          style={[styles.addButton, { backgroundColor: primaryColor }]}
          onPress={() => setModalVisible(true)}
        >
          <IconSymbol name="plus" size={18} color="#fff" />
          <Text style={styles.addButtonText}>New</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.collectionsContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
        }
      >
        {collections.map((collection, index) => (
          <SwipeableCollectionCard
            key={collection.id}
            collection={collection}
            index={index}
            onPress={() => handleCollectionPress(collection)}
            onDelete={() => handleDeleteCollection(collection.id)}
          />
        ))}
        {collections.length <= 1 && renderEmptyHint()}
      </ScrollView>

      <AddCollectionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onAdd={handleAddCollection}
      />
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  collectionsContainer: {
    padding: 16,
    gap: 12,
  },
  hintContainer: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  hintText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

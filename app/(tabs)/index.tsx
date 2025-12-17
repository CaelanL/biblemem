import { IconSymbol } from '@/components/ui/icon-symbol';
import { AddCollectionModal } from '@/components/library/AddCollectionModal';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getCollections,
  createCollection,
  getCollectionVerseCount,
  type Collection,
} from '@/lib/storage';
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
    await createCollection(name);
    await loadCollections();
  };

  const handleCollectionPress = (collection: Collection) => {
    router.push(`/collection/${collection.id}`);
  };

  const cardBg = isDark ? '#1c1c1e' : '#ffffff';
  const borderColor = isDark ? 'rgba(96,165,250,0.3)' : 'rgba(10,126,164,0.25)';
  const primaryColor = isDark ? '#60a5fa' : '#0a7ea4';

  const renderCollectionCard = (collection: CollectionWithCount, index: number) => (
    <Animated.View
      key={collection.id}
      entering={FadeInDown.delay(index * 80).duration(300)}
    >
      <Pressable
        style={[
          styles.collectionCard,
          {
            backgroundColor: cardBg,
            borderColor,
          },
        ]}
        onPress={() => handleCollectionPress(collection)}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardLeft}>
            <View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: collection.isDefault
                    ? `${primaryColor}15`
                    : isDark
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(0,0,0,0.05)',
                },
              ]}
            >
              <IconSymbol
                name={collection.isDefault ? 'heart.fill' : 'folder.fill'}
                size={24}
                color={collection.isDefault ? primaryColor : colors.icon}
              />
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.collectionName, { color: colors.text }]}>
                {collection.name}
              </Text>
              <Text style={[styles.verseCount, { color: colors.icon }]}>
                {collection.verseCount} verse{collection.verseCount !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
          <IconSymbol name="chevron.right" size={18} color={colors.icon} />
        </View>
      </Pressable>
    </Animated.View>
  );

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
        {collections.map((collection, index) => renderCollectionCard(collection, index))}
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
  collectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardText: {
    gap: 2,
  },
  collectionName: {
    fontSize: 17,
    fontWeight: '600',
  },
  verseCount: {
    fontSize: 14,
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

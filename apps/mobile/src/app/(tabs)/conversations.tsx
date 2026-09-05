import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useChatStore } from '../../store/chat.store';
import { darkTheme } from '../../theme/colors';
import { Search, Trash2, MessageSquare, Plus } from 'lucide-react-native';
import { Conversation } from '@talk-to-krisna/shared';

export default function ConversationsScreen() {
  const router = useRouter();
  const { conversations, fetchConversations, deleteConversation, createConversation, isLoading } = useChatStore();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchConversations();
  }, []);

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = (id: string, title: string) => {
    Alert.alert(
      'Release Reflection',
      `Are you sure you wish to delete "${title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteConversation(id);
            } catch (err) {
              console.error('Delete failed', err);
            }
          },
        },
      ]
    );
  };

  const handleCreateNew = async () => {
    try {
      const conv = await createConversation('New Reflection');
      router.push({ pathname: '/chat/[id]', params: { id: conv.id } });
    } catch (err) {
      console.error('Failed to create new reflection', err);
    }
  };

  const renderItem = ({ item }: { item: Conversation }) => (
    <TouchableOpacity
      style={styles.convCard}
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
    >
      <View style={styles.convIconContainer}>
        <MessageSquare color={darkTheme.primary} size={20} />
      </View>
      <View style={styles.convContent}>
        <Text style={styles.convTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.convDate}>
          {new Date(item.updatedAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDelete(item.id, item.title)}
      >
        <Trash2 color={darkTheme.textMuted} size={18} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Search & Action Bar */}
        <View style={styles.topBar}>
          <View style={styles.searchBar}>
            <Search color={darkTheme.textMuted} size={18} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search previous dialogues..."
              placeholderTextColor={darkTheme.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          <TouchableOpacity style={styles.newButton} onPress={handleCreateNew}>
            <Plus color="#0B0F19" size={20} />
          </TouchableOpacity>
        </View>

        {isLoading && conversations.length === 0 ? (
          <ActivityIndicator color={darkTheme.primary} style={{ marginTop: 40 }} />
        ) : filteredConversations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MessageSquare color={darkTheme.textMuted} size={48} />
            <Text style={styles.emptyTitle}>No reflections found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery ? 'Try another search term' : 'Every journey begins with a single question.'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity style={styles.emptyActionButton} onPress={handleCreateNew}>
                <Text style={styles.emptyActionButtonText}>Begin New Reflection</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredConversations}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: darkTheme.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 16,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: darkTheme.textPrimary,
    fontSize: 14,
  },
  newButton: {
    backgroundColor: darkTheme.primary,
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 24,
    gap: 10,
  },
  convCard: {
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  convIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: darkTheme.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  convContent: {
    flex: 1,
  },
  convTitle: {
    color: darkTheme.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  convDate: {
    color: darkTheme.textMuted,
    fontSize: 12,
  },
  deleteButton: {
    padding: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: {
    color: darkTheme.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    color: darkTheme.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyActionButton: {
    backgroundColor: darkTheme.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyActionButtonText: {
    color: '#0B0F19',
    fontSize: 14,
    fontWeight: '700',
  },
});

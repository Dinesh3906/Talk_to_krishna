import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useChatStore } from '../../store/chat.store';
import { darkTheme } from '../../theme/colors';
import { ArrowLeft, MessageSquare } from 'lucide-react-native';

export default function ConversationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeConversation, fetchConversationDetails } = useChatStore();

  useEffect(() => {
    if (id) {
      fetchConversationDetails(id);
    }
  }, [id]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft color={darkTheme.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {activeConversation?.title || 'Reflection Record'}
        </Text>
      </View>

      <FlatList
        data={activeConversation?.messages || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isUser = item.sender === 'user';
          return (
            <View style={[styles.bubble, isUser ? styles.userBubble : styles.krishnaBubble]}>
              <Text style={styles.senderTag}>{isUser ? 'You' : 'Krishna'}</Text>
              <Text style={styles.content}>{item.content}</Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: darkTheme.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.surfaceBorder,
    backgroundColor: darkTheme.surface,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  title: {
    color: darkTheme.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  bubble: {
    padding: 14,
    borderRadius: 12,
  },
  userBubble: {
    backgroundColor: darkTheme.userBubble,
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  krishnaBubble: {
    backgroundColor: darkTheme.krishnaBubble,
    borderColor: darkTheme.krishnaBorder,
    borderWidth: 1,
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  senderTag: {
    color: darkTheme.primary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  content: {
    color: darkTheme.textPrimary,
    fontSize: 14,
    lineHeight: 22,
  },
});

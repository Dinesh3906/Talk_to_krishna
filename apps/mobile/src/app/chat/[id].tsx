import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useChatStore } from '../../store/chat.store';
import { useAuthStore } from '../../store/auth.store';
import { darkTheme } from '../../theme/colors';
import {
  ArrowLeft,
  Send,
  BookOpen,
  Copy,
  Share2,
  RotateCcw,
  Trash2,
  Info,
  X,
  Sparkles,
  AlertTriangle,
} from 'lucide-react-native';
import { Message, Citation } from '@talk-to-krisna/shared';

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; initialPrompt?: string }>();
  const conversationId = params.id as string;
  const initialPrompt = params.initialPrompt;

  const user = useAuthStore((s) => s.user);
  const {
    activeConversation,
    fetchConversationDetails,
    sendMessageStream,
    isStreaming,
    streamingContent,
    streamingCitations,
    error,
    deleteConversation,
  } = useChatStore();

  const [inputMessage, setInputMessage] = useState('');
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [quoteCardMessage, setQuoteCardMessage] = useState<Message | null>(null);

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (conversationId) {
      fetchConversationDetails(conversationId);
    }
  }, [conversationId]);

  useEffect(() => {
    if (initialPrompt && activeConversation && activeConversation.messages.length === 0) {
      sendMessageStream(conversationId, initialPrompt, user?.preferredName);
    }
  }, [initialPrompt, activeConversation?.id]);

  const handleSend = () => {
    if (!inputMessage.trim() || isStreaming) return;
    const content = inputMessage.trim();
    setInputMessage('');
    sendMessageStream(conversationId, content, user?.preferredName);
  };

  const handleCopy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Words copied to clipboard.');
  };

  const handleShare = async (msg: Message) => {
    setQuoteCardMessage(msg);
  };

  const handleDeleteConversation = () => {
    Alert.alert('Delete Reflection', 'Are you sure you wish to delete this entire dialogue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteConversation(conversationId);
          router.replace('/(tabs)/conversations');
        },
      },
    ]);
  };

  const renderMessageItem = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';

    return (
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.krishnaRow]}>
        {!isUser && (
          <View style={styles.krishnaAvatar}>
            <Image
              source={require('../../../assets/images/krishna-logo.png')}
              style={styles.krishnaAvatarImage}
              resizeMode="cover"
            />
          </View>
        )}

        <View style={[styles.bubble, isUser ? styles.userBubble : styles.krishnaBubble]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.krishnaText]}>
            {item.content}
          </Text>

          {/* Citations Bar */}
          {!isUser && item.citations && item.citations.length > 0 && (
            <View style={styles.citationsContainer}>
              <Text style={styles.citationsHeader}>SOURCES ANCHORED IN CORPUS:</Text>
              <View style={styles.citationChipsRow}>
                {item.citations.map((cit, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.citationChip}
                    onPress={() => setSelectedCitation(cit)}
                  >
                    <BookOpen color={darkTheme.primary} size={12} />
                    <Text style={styles.citationChipText}>{cit.sourceReference}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Assistant Action Bar */}
          {!isUser && (
            <View style={styles.bubbleActionBar}>
              <TouchableOpacity style={styles.actionIconButton} onPress={() => handleCopy(item.content)}>
                <Copy color={darkTheme.textMuted} size={15} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionIconButton} onPress={() => handleShare(item)}>
                <Share2 color={darkTheme.textMuted} size={15} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <ArrowLeft color={darkTheme.textPrimary} size={20} />
        </TouchableOpacity>
        <View style={styles.headerAvatarContainer}>
          <Image
            source={require('../../../assets/images/krishna-logo.png')}
            style={styles.headerAvatar}
            resizeMode="cover"
          />
        </View>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {activeConversation?.title || 'Dialogue with Krishna'}
          </Text>
          <Text style={styles.headerSubtitle}>Canonical Mahabharata Grounding</Text>
        </View>
        <TouchableOpacity style={styles.headerButton} onPress={handleDeleteConversation}>
          <Trash2 color={darkTheme.textMuted} size={18} />
        </TouchableOpacity>
      </View>

      {/* Error Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <AlertTriangle color="#F87171" size={16} />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      {/* Message List */}
      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={activeConversation?.messages || []}
          keyExtractor={(item) => item.id}
          renderItem={renderMessageItem}
          contentContainerStyle={styles.listContainer}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListFooterComponent={
            isStreaming ? (
              <View style={[styles.messageRow, styles.krishnaRow]}>
                <View style={styles.krishnaAvatar}>
                  <Image
                    source={require('../../../assets/images/krishna-logo.png')}
                    style={styles.krishnaAvatarImage}
                    resizeMode="cover"
                  />
                </View>
                <View style={[styles.bubble, styles.krishnaBubble]}>
                  <Text style={[styles.messageText, styles.krishnaText]}>
                    {streamingContent}
                    <Text style={styles.cursorPulse}> ▍</Text>
                  </Text>
                  {streamingCitations.length > 0 && (
                    <View style={styles.citationsContainer}>
                      <Text style={styles.citationsHeader}>RETRIEVING CANONICAL SOURCES:</Text>
                      <View style={styles.citationChipsRow}>
                        {streamingCitations.map((cit, idx) => (
                          <View key={idx} style={styles.citationChip}>
                            <BookOpen color={darkTheme.primary} size={12} />
                            <Text style={styles.citationChipText}>{cit.sourceReference}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              </View>
            ) : null
          }
        />

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.inputField}
            placeholder={user?.preferredName ? `Reflect with Krishna, ${user.preferredName}...` : 'Reflect with Krishna...'}
            placeholderTextColor={darkTheme.textMuted}
            value={inputMessage}
            onChangeText={setInputMessage}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendCircle, (!inputMessage.trim() || isStreaming) && styles.sendCircleDisabled]}
            onPress={handleSend}
            disabled={!inputMessage.trim() || isStreaming}
          >
            {isStreaming ? (
              <ActivityIndicator size="small" color="#0B0F19" />
            ) : (
              <Send color="#0B0F19" size={18} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Citation Details Modal */}
      <Modal visible={!!selectedCitation} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <BookOpen color={darkTheme.primary} size={20} />
                <Text style={styles.modalTitle}>{selectedCitation?.sourceReference}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedCitation(null)}>
                <X color={darkTheme.textMuted} size={20} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <View style={styles.quoteTypeBadge}>
                <Text style={styles.quoteTypeBadgeText}>
                  {selectedCitation?.quoteType === 'direct_quote'
                    ? 'VERIFIED DIRECT QUOTE'
                    : selectedCitation?.quoteType === 'paraphrase'
                    ? 'CANONICAL PARAPHRASE'
                    : 'KRISHNA-INSPIRED GUIDANCE'}
                </Text>
              </View>

              {selectedCitation?.speaker && (
                <Text style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Speaker: </Text>
                  {selectedCitation.speaker} | <Text style={styles.metaLabel}>Listener: </Text>
                  {selectedCitation.listener || 'Seeker'}
                </Text>
              )}

              {selectedCitation?.originalText && (
                <View style={styles.sanskritBox}>
                  <Text style={styles.sanskritText}>{selectedCitation.originalText}</Text>
                </View>
              )}

              <Text style={styles.translationLabel}>Authoritative Translation:</Text>
              <Text style={styles.translationText}>"{selectedCitation?.translation}"</Text>

              {selectedCitation?.contextSummary && (
                <View style={styles.contextBox}>
                  <Text style={styles.contextLabel}>Context in Epic:</Text>
                  <Text style={styles.contextText}>{selectedCitation.contextSummary}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Share Quote Card Modal */}
      <Modal visible={!!quoteCardMessage} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.cardShareContainer}>
            <View style={styles.shareCardHeader}>
              <Text style={styles.shareCardTitle}>Share Sacred Reflection</Text>
              <TouchableOpacity onPress={() => setQuoteCardMessage(null)}>
                <X color={darkTheme.textMuted} size={20} />
              </TouchableOpacity>
            </View>

            {/* Aesthetic Quote Card */}
            <View style={styles.quoteCardVisual}>
              <Text style={styles.cardOm}>ॐ</Text>
              <Text style={styles.cardQuoteText} numberOfLines={6}>
                "{quoteCardMessage?.content}"
              </Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardAuthor}>Talk to Krishna</Text>
                <Text style={styles.cardSource}>Grounded in the Mahabharata</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.shareSubmitButton}
              onPress={async () => {
                if (quoteCardMessage) {
                  await Clipboard.setStringAsync(
                    `"${quoteCardMessage.content}"\n\n— Inspired by Lord Krishna & the Mahabharata`
                  );
                  Alert.alert('Reflection Copied', 'Ready to share on your favorite platforms.');
                  setQuoteCardMessage(null);
                }
              }}
            >
              <Share2 color="#0B0F19" size={18} />
              <Text style={styles.shareSubmitText}>Copy & Share Card</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.surfaceBorder,
    backgroundColor: darkTheme.surface,
  },
  headerButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  headerTitle: {
    color: darkTheme.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: darkTheme.primary,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: darkTheme.danger,
    borderWidth: 1,
    padding: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  errorBannerText: {
    color: '#FCA5A5',
    fontSize: 13,
    flex: 1,
  },
  chatArea: {
    flex: 1,
  },
  listContainer: {
    padding: 16,
    gap: 16,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  krishnaRow: {
    justifyContent: 'flex-start',
    gap: 10,
  },
  krishnaAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.primary,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  krishnaAvatarText: {
    color: darkTheme.primary,
    fontSize: 16,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 16,
    padding: 14,
  },
  userBubble: {
    backgroundColor: darkTheme.userBubble,
    borderBottomRightRadius: 4,
  },
  krishnaBubble: {
    backgroundColor: darkTheme.krishnaBubble,
    borderColor: darkTheme.krishnaBorder,
    borderWidth: 1,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 23,
  },
  userText: {
    color: darkTheme.textPrimary,
  },
  krishnaText: {
    color: darkTheme.textPrimary,
  },
  cursorPulse: {
    color: darkTheme.primary,
    fontWeight: '700',
  },
  citationsContainer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212, 175, 55, 0.2)',
  },
  citationsHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: darkTheme.primary,
    letterSpacing: 1,
    marginBottom: 6,
  },
  citationChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  citationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  citationChipText: {
    color: darkTheme.primaryLight,
    fontSize: 11,
    fontWeight: '600',
  },
  bubbleActionBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
    paddingTop: 6,
  },
  actionIconButton: {
    padding: 4,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: darkTheme.surface,
    borderTopWidth: 1,
    borderTopColor: darkTheme.surfaceBorder,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  inputField: {
    flex: 1,
    color: darkTheme.textPrimary,
    fontSize: 15,
    maxHeight: 120,
    paddingVertical: 8,
  },
  sendCircle: {
    backgroundColor: darkTheme.primary,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendCircleDisabled: {
    opacity: 0.35,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    width: '100%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    color: darkTheme.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  modalScroll: {
    marginTop: 4,
  },
  quoteTypeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: darkTheme.primaryMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 12,
  },
  quoteTypeBadgeText: {
    color: darkTheme.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  metaRow: {
    color: darkTheme.textSecondary,
    fontSize: 13,
    marginBottom: 12,
  },
  metaLabel: {
    color: darkTheme.textMuted,
  },
  sanskritBox: {
    backgroundColor: darkTheme.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  sanskritText: {
    color: darkTheme.accent,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  translationLabel: {
    color: darkTheme.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  translationText: {
    color: darkTheme.textPrimary,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 14,
  },
  contextBox: {
    borderTopWidth: 1,
    borderTopColor: darkTheme.surfaceBorder,
    paddingTop: 10,
  },
  contextLabel: {
    color: darkTheme.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  contextText: {
    color: darkTheme.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  cardShareContainer: {
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    width: '100%',
  },
  shareCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  shareCardTitle: {
    color: darkTheme.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  quoteCardVisual: {
    backgroundColor: '#0F172A',
    borderColor: darkTheme.primary,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  cardOm: {
    color: darkTheme.primary,
    fontSize: 32,
    marginBottom: 12,
  },
  cardQuoteText: {
    color: '#F8FAFC',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  cardFooter: {
    alignItems: 'center',
  },
  cardAuthor: {
    color: darkTheme.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  cardSource: {
    color: darkTheme.textMuted,
    fontSize: 11,
  },
  shareSubmitButton: {
    backgroundColor: darkTheme.primary,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shareSubmitText: {
    color: '#0B0F19',
    fontSize: 15,
    fontWeight: '700',
  },
});

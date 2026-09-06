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
  Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useChatStore } from '../store/chat.store';
import { useAuthStore } from '../store/auth.store';
import { darkTheme } from '../theme/colors';
import { ChatDrawer } from '../components/ChatDrawer';
import {
  Menu,
  Plus,
  Send,
  BookOpen,
  Copy,
  Share2,
  Sparkles,
  ChevronDown,
  X,
  ShieldCheck,
  Compass,
} from 'lucide-react-native';
import { Message, Citation } from '@talk-to-krisna/shared';

const STARTER_PROMPTS = [
  {
    title: 'The Battlefield of Mind',
    prompt: "Tell me about Arjuna's dilemma at Kurukshetra and how Krishna guided him.",
    icon: '🏹',
  },
  {
    title: 'Detachment & Peace',
    prompt: 'How do I let go of grief, past pain, and attachment to outcomes?',
    icon: '🕊️',
  },
  {
    title: 'Right Action & Duty',
    prompt: 'How do I know my true Dharma when every choice feels difficult?',
    icon: '⚖️',
  },
  {
    title: 'Mastering the Senses',
    prompt: 'How can I control anger, restlessness, and mental turbulence?',
    icon: '🔥',
  },
];

export default function DirectChatScreen() {
  const user = useAuthStore((s) => s.user);
  const {
    conversations,
    activeConversation,
    fetchConversations,
    fetchConversationDetails,
    createConversation,
    sendMessageStream,
    isStreaming,
    streamingContent,
    streamingCitations,
    clearActiveConversation,
  } = useChatStore();

  const [inputMessage, setInputMessage] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (activeConversation?.messages && activeConversation.messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [activeConversation?.messages, streamingContent]);

  const handleNewChat = () => {
    clearActiveConversation();
    setInputMessage('');
  };

  const handleSelectConversation = async (id: string) => {
    await fetchConversationDetails(id);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isStreaming) return;

    setInputMessage('');

    let conversationId = activeConversation?.id;
    if (!conversationId) {
      const newConv = await createConversation(text.slice(0, 35));
      conversationId = newConv.id;
    }

    await sendMessageStream(conversationId, text, user?.preferredName || user?.displayName);
  };

  const handleCopy = async (text: string) => {
    await Clipboard.setStringAsync(text);
  };

  const handleShare = async (text: string) => {
    try {
      await Share.share({
        message: `Lord Krishna: "${text}"\n\n— via Talk to Krishna`,
      });
    } catch {}
  };

  const messages = activeConversation?.messages || [];

  return (
    <SafeAreaView style={styles.container}>
      {/* Sliding Drawer */}
      <ChatDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        activeConversationId={activeConversation?.id}
      />

      {/* Top Navigation Bar (ChatGPT / Gemini style) */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setDrawerOpen(true)}
          activeOpacity={0.7}
        >
          <Menu size={22} color="#F8FAFC" />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <View style={styles.omMiniBadge}>
            <Text style={styles.omMiniText}>ॐ</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Talk to Krishna</Text>
            <Text style={styles.headerSub}>Divine Sanctuary</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.iconButton}
          onPress={handleNewChat}
          activeOpacity={0.7}
        >
          <Plus size={22} color={darkTheme.primary} />
        </TouchableOpacity>
      </View>

      {/* Main Conversation Canvas */}
      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        {messages.length === 0 && !isStreaming ? (
          /* Empty / Welcome State */
          <ScrollView contentContainerStyle={styles.welcomeContainer}>
            <View style={styles.sacredCircle}>
              <Text style={styles.sacredOm}>ॐ</Text>
            </View>
            <Text style={styles.welcomeTitle}>Welcome, O Seeker</Text>
            <Text style={styles.welcomeSubtitle}>
              Speak freely of your life, dilemmas, and questions. Timeless wisdom from the Mahabharata awaits you.
            </Text>

            <View style={styles.startersGrid}>
              {STARTER_PROMPTS.map((starter, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.starterCard}
                  onPress={() => handleSendMessage(starter.prompt)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.starterIcon}>{starter.icon}</Text>
                  <View style={styles.starterTextContainer}>
                    <Text style={styles.starterTitle}>{starter.title}</Text>
                    <Text style={styles.starterPrompt} numberOfLines={2}>
                      {starter.prompt}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : (
          /* Active Messages List */
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            renderItem={({ item }) => {
              const isUser = item.sender === 'user';
              return (
                <View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
                  {!isUser && (
                    <View style={styles.krishnaAvatar}>
                      <Text style={styles.krishnaAvatarText}>ॐ</Text>
                    </View>
                  )}

                  <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
                    <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
                      {item.content}
                    </Text>

                    {/* Citations / Source Badges */}
                    {!isUser && item.citations && item.citations.length > 0 && (
                      <View style={styles.citationsContainer}>
                        <Text style={styles.citationsLabel}>Sources:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          {item.citations.map((cite: Citation, idx: number) => (
                            <TouchableOpacity
                              key={idx}
                              style={styles.citationBadge}
                              onPress={() => setSelectedCitation(cite)}
                              activeOpacity={0.7}
                            >
                              <BookOpen size={11} color={darkTheme.primary} />
                              <Text style={styles.citationText} numberOfLines={1}>
                                {cite.sourceReference || cite.parva || 'Mahābhārata'}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    {/* Message Actions for Krishna's replies */}
                    {!isUser && (
                      <View style={styles.bubbleActions}>
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => handleCopy(item.content)}
                          activeOpacity={0.7}
                        >
                          <Copy size={13} color={darkTheme.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => handleShare(item.content)}
                          activeOpacity={0.7}
                        >
                          <Share2 size={13} color={darkTheme.textMuted} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
            ListFooterComponent={
              isStreaming ? (
                <View style={[styles.messageRow, styles.assistantRow]}>
                  <View style={styles.krishnaAvatar}>
                    <Text style={styles.krishnaAvatarText}>ॐ</Text>
                  </View>
                  <View style={[styles.bubble, styles.assistantBubble]}>
                    <Text style={styles.assistantText}>
                      {streamingContent || 'Krishna is reflecting...'}
                    </Text>
                    <View style={styles.streamingIndicator}>
                      <ActivityIndicator size="small" color={darkTheme.primary} />
                      <Text style={styles.streamingText}>Contemplating scripture...</Text>
                    </View>
                  </View>
                </View>
              ) : null
            }
          />
        )}

        {/* Input Bar (ChatGPT / Gemini style) */}
        <View style={styles.inputContainer}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              placeholder="Ask Krishna for guidance..."
              placeholderTextColor={darkTheme.textMuted}
              value={inputMessage}
              onChangeText={setInputMessage}
              multiline
              maxLength={2000}
              editable={!isStreaming}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!inputMessage.trim() || isStreaming) && styles.sendButtonDisabled,
              ]}
              onPress={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isStreaming}
              activeOpacity={0.8}
            >
              {isStreaming ? (
                <ActivityIndicator size="small" color="#0B0F19" />
              ) : (
                <Send size={16} color="#0B0F19" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Citation Detail Modal */}
      {selectedCitation && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSelectedCitation(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleRow}>
                  <BookOpen size={16} color={darkTheme.primary} />
                  <Text style={styles.modalTitle}>
                    {selectedCitation.sourceReference || selectedCitation.source || 'Mahābhārata'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedCitation(null)}>
                  <X size={18} color={darkTheme.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalMeta}>
                {selectedCitation.parva ? `Parva: ${selectedCitation.parva}` : selectedCitation.source}
                {selectedCitation.speaker ? ` • Speaker: ${selectedCitation.speaker}` : ''}
              </Text>
              <ScrollView style={styles.modalScroll}>
                <Text style={styles.modalQuote}>"{selectedCitation.translation}"</Text>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0E1320',
  },
  iconButton: {
    padding: 8,
    borderRadius: 8,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  omMiniBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1,
    borderColor: darkTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  omMiniText: {
    color: darkTheme.primary,
    fontSize: 13,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
  },
  headerSub: {
    color: darkTheme.textMuted,
    fontSize: 11,
  },
  chatArea: {
    flex: 1,
  },
  welcomeContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 36,
    paddingBottom: 24,
  },
  sacredCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: darkTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: darkTheme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  sacredOm: {
    fontSize: 36,
    color: darkTheme.primary,
    fontWeight: 'bold',
  },
  welcomeTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    color: darkTheme.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 320,
    marginBottom: 28,
  },
  startersGrid: {
    width: '100%',
    gap: 10,
  },
  starterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131A2B',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  starterIcon: {
    fontSize: 22,
  },
  starterTextContainer: {
    flex: 1,
  },
  starterTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  starterPrompt: {
    color: darkTheme.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },
  krishnaAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
    borderWidth: 1,
    borderColor: darkTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginTop: 2,
  },
  krishnaAvatarText: {
    color: darkTheme.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: '#1E293B',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#131A2B',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userText: {
    color: '#F8FAFC',
  },
  assistantText: {
    color: '#E2E8F0',
  },
  citationsContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  citationsLabel: {
    color: darkTheme.textMuted,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  citationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
    gap: 4,
  },
  citationText: {
    color: darkTheme.primary,
    fontSize: 11,
  },
  bubbleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
    paddingTop: 4,
  },
  actionButton: {
    padding: 2,
  },
  streamingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  streamingText: {
    color: darkTheme.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
  },
  inputContainer: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    backgroundColor: '#0E1320',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#1E293B',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  textInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 14,
    maxHeight: 120,
    paddingTop: 6,
    paddingBottom: 6,
    marginRight: 8,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: darkTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendButtonDisabled: {
    backgroundColor: '#475569',
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#131A2B',
    width: '100%',
    maxHeight: '75%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: darkTheme.primary,
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
  },
  modalMeta: {
    color: darkTheme.textMuted,
    fontSize: 12,
    marginBottom: 12,
  },
  modalScroll: {
    maxHeight: 250,
  },
  modalQuote: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 20,
    fontStyle: 'italic',
  },
});

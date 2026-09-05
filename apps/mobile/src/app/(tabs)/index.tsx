import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/auth.store';
import { useChatStore } from '../../store/chat.store';
import { darkTheme } from '../../theme/colors';
import { Sparkles, ArrowRight, BookOpen, Clock } from 'lucide-react-native';

const STARTER_PROMPTS = [
  {
    title: 'Heartbreak & Separation',
    prompt: 'I just had a breakup.',
    icon: '💔',
  },
  {
    title: 'Fear of Failure',
    prompt: 'I failed my exam and fear disappointing my parents.',
    icon: '🎯',
  },
  {
    title: 'The Battlefield of Mind',
    prompt: "Tell me about Arjuna's dilemma at Kurukshetra.",
    icon: '🏹',
  },
  {
    title: 'Restraint over Anger',
    prompt: 'I feel deep anger toward someone and want revenge.',
    icon: '🔥',
  },
  {
    title: 'Career & Values',
    prompt: 'Should I take the job that pays more or the one I actually enjoy?',
    icon: '⚖️',
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { conversations, fetchConversations, createConversation, isLoading } = useChatStore();
  const [directPrompt, setDirectPrompt] = React.useState('');

  useEffect(() => {
    fetchConversations();
  }, []);

  const handleStartConversation = async (text: string) => {
    if (!text.trim()) return;
    try {
      const conv = await createConversation(text.slice(0, 30));
      router.push({
        pathname: '/chat/[id]',
        params: { id: conv.id, initialPrompt: text },
      });
    } catch (err) {
      console.error('Failed to create conversation', err);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Header Greeting */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerAvatarContainer}>
              <Image
                source={require('../../../assets/images/krishna-logo.png')}
                style={styles.headerAvatar}
                resizeMode="cover"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.greetingLabel}>Pranām,</Text>
              <Text style={styles.greetingTitle}>
                {user?.preferredName
                  ? `What weighs upon your heart, ${user.preferredName}?`
                  : 'What weighs upon your heart today?'}
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Input Bar */}
        <View style={styles.inputCard}>
          <TextInput
            style={styles.textInput}
            placeholder="Speak of your dilemma, grief, or question..."
            placeholderTextColor={darkTheme.textMuted}
            value={directPrompt}
            onChangeText={setDirectPrompt}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, !directPrompt.trim() && styles.sendButtonDisabled]}
            onPress={() => {
              handleStartConversation(directPrompt);
              setDirectPrompt('');
            }}
            disabled={!directPrompt.trim()}
          >
            <ArrowRight color="#0B0F19" size={20} />
          </TouchableOpacity>
        </View>

        {/* Canonical Daily Wisdom Card */}
        <View style={styles.dailyCard}>
          <View style={styles.dailyHeader}>
            <BookOpen color={darkTheme.primary} size={16} />
            <Text style={styles.dailyTag}>CANONICAL CONTEMPLATION</Text>
          </View>
          <Text style={styles.dailyVerseSanskrit}>
            कर्मण्येवाधिकारस्ते मा फलेषु कदाचन |{'\n'}मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि ||
          </Text>
          <Text style={styles.dailyVerseTranslation}>
            "You have a right only to perform your duty, but never to the fruits of your actions. Let not the fruit of action be your motive, nor your attachment be to inaction."
          </Text>
          <Text style={styles.dailyReference}>Bhagavad Gita — Chapter 2, Verse 47</Text>
        </View>

        {/* Suggested Conversation Starters */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Paths of Contemplation</Text>
          <View style={styles.startersGrid}>
            {STARTER_PROMPTS.map((starter, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.starterCard}
                onPress={() => handleStartConversation(starter.prompt)}
              >
                <Text style={styles.starterIcon}>{starter.icon}</Text>
                <View style={styles.starterContent}>
                  <Text style={styles.starterTitle}>{starter.title}</Text>
                  <Text style={styles.starterPrompt} numberOfLines={2}>
                    "{starter.prompt}"
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Recent Conversations */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Reflections</Text>
            {conversations.length > 0 && (
              <TouchableOpacity onPress={() => router.push('/(tabs)/conversations')}>
                <Text style={styles.seeAllText}>View All</Text>
              </TouchableOpacity>
            )}
          </View>

          {isLoading && conversations.length === 0 ? (
            <ActivityIndicator color={darkTheme.primary} style={{ marginVertical: 16 }} />
          ) : conversations.length === 0 ? (
            <View style={styles.emptyCard}>
              <Clock color={darkTheme.textMuted} size={24} />
              <Text style={styles.emptyText}>No previous reflections recorded.</Text>
              <Text style={styles.emptySubtext}>Select a path above to begin your first dialogue.</Text>
            </View>
          ) : (
            conversations.slice(0, 3).map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.recentItem}
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
              >
                <View style={styles.recentInfo}>
                  <Text style={styles.recentTitle} numberOfLines={1}>
                    {c.title}
                  </Text>
                  <Text style={styles.recentDate}>
                    {new Date(c.updatedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </View>
                <ArrowRight color={darkTheme.textMuted} size={16} />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: darkTheme.background,
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginTop: 12,
    marginBottom: 20,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerAvatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#F59E0B',
    overflow: 'hidden',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  headerAvatar: {
    width: '100%',
    height: '100%',
  },
  greetingLabel: {
    fontSize: 14,
    color: darkTheme.primary,
    letterSpacing: 1.5,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  greetingTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: darkTheme.textPrimary,
    lineHeight: 34,
  },
  inputCard: {
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  textInput: {
    flex: 1,
    color: darkTheme.textPrimary,
    fontSize: 15,
    maxHeight: 100,
    paddingRight: 12,
  },
  sendButton: {
    backgroundColor: darkTheme.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  dailyCard: {
    backgroundColor: darkTheme.krishnaBubble,
    borderColor: darkTheme.krishnaBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 28,
  },
  dailyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dailyTag: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: darkTheme.primary,
  },
  dailyVerseSanskrit: {
    color: darkTheme.accent,
    fontSize: 14,
    lineHeight: 22,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  dailyVerseTranslation: {
    color: darkTheme.textPrimary,
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 10,
  },
  dailyReference: {
    color: darkTheme.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: darkTheme.textPrimary,
    marginBottom: 14,
  },
  seeAllText: {
    fontSize: 13,
    color: darkTheme.primaryLight,
    fontWeight: '600',
  },
  startersGrid: {
    gap: 12,
  },
  starterCard: {
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  starterIcon: {
    fontSize: 24,
  },
  starterContent: {
    flex: 1,
  },
  starterTitle: {
    color: darkTheme.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  starterPrompt: {
    color: darkTheme.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyCard: {
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: darkTheme.textSecondary,
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
  },
  emptySubtext: {
    color: darkTheme.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  recentItem: {
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  recentInfo: {
    flex: 1,
    marginRight: 8,
  },
  recentTitle: {
    color: darkTheme.textPrimary,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  recentDate: {
    color: darkTheme.textMuted,
    fontSize: 12,
  },
});

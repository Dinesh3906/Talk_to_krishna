import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  Modal,
  TouchableWithoutFeedback,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/auth.store';
import { useChatStore } from '../store/chat.store';
import { darkTheme } from '../theme/colors';
import { KrishnaAvatar } from './KrishnaAvatar';
import {
  Plus,
  MessageSquare,
  Trash2,
  LogOut,
  X,
  User as UserIcon,
  Sparkles,
  ChevronRight,
} from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 340);

interface ChatDrawerProps {
  visible: boolean;
  onClose: () => void;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  activeConversationId?: string;
}

export function ChatDrawer({
  visible,
  onClose,
  onSelectConversation,
  onNewChat,
  activeConversationId,
}: ChatDrawerProps) {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { conversations, fetchConversations, deleteConversation, isLoading } = useChatStore();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      fetchConversations();
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleLogout = () => {
    setShowProfileMenu(false);
    onClose();
    logout();
    router.replace('/(auth)/login');
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert(
      'Delete Conversation',
      `Are you sure you want to delete "${title || 'this conversation'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteConversation(id);
          },
        },
      ]
    );
  };

  if (!visible && (slideAnim as any)._value === -DRAWER_WIDTH) {
    return null;
  }

  const userInitial = (user?.displayName || user?.email || 'S').charAt(0).toUpperCase();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Backdrop */}
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />
        </TouchableWithoutFeedback>

        {/* Drawer content */}
        <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <KrishnaAvatar size={32} />
              <Text style={styles.brandTitle}>Talk to Krishna</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
              <X size={20} color={darkTheme.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* New Chat Button (ChatGPT / Gemini style) */}
          <TouchableOpacity
            style={styles.newChatButton}
            onPress={() => {
              onNewChat();
              onClose();
            }}
            activeOpacity={0.8}
          >
            <Plus size={18} color="#0B0F19" />
            <Text style={styles.newChatText}>New Conversation</Text>
          </TouchableOpacity>

          {/* Conversations Section Header */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>PAST REFLECTIONS</Text>
          </View>

          {/* Conversations List */}
          <ScrollView style={styles.conversationsList} contentContainerStyle={styles.listContent}>
            {isLoading && conversations.length === 0 ? (
              <ActivityIndicator size="small" color={darkTheme.primary} style={{ marginTop: 24 }} />
            ) : conversations.length === 0 ? (
              <View style={styles.emptyState}>
                <Sparkles size={24} color={darkTheme.textMuted} />
                <Text style={styles.emptyTitle}>No past conversations</Text>
                <Text style={styles.emptySubtitle}>Your dialogues with Krishna will appear here</Text>
              </View>
            ) : (
              conversations.map((conv) => {
                const isActive = conv.id === activeConversationId;
                return (
                  <TouchableOpacity
                    key={conv.id}
                    style={[styles.convItem, isActive && styles.convItemActive]}
                    onPress={() => {
                      onSelectConversation(conv.id);
                      onClose();
                    }}
                    activeOpacity={0.7}
                  >
                    <MessageSquare
                      size={16}
                      color={isActive ? darkTheme.primary : darkTheme.textMuted}
                      style={{ marginRight: 10 }}
                    />
                    <Text
                      numberOfLines={1}
                      style={[styles.convTitle, isActive && styles.convTitleActive]}
                    >
                      {conv.title || 'Sacred Reflection'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleDelete(conv.id, conv.title)}
                      style={styles.deleteBtn}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Trash2 size={14} color={darkTheme.textMuted} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* Profile Menu Popover */}
          {showProfileMenu && (
            <View style={styles.profilePopover}>
              <View style={styles.popoverHeader}>
                <Text style={styles.popoverName}>{user?.displayName || 'Seeker'}</Text>
                <Text style={styles.popoverEmail}>{user?.email || 'Guest Mode'}</Text>
              </View>
              <View style={styles.popoverDivider} />
              <TouchableOpacity style={styles.popoverAction} onPress={handleLogout}>
                <LogOut size={16} color="#EF4444" />
                <Text style={styles.popoverLogoutText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Bottom Left Profile Bar (ChatGPT / Gemini style) */}
          <View style={styles.profileBar}>
            <TouchableOpacity
              style={styles.profileButton}
              onPress={() => setShowProfileMenu(!showProfileMenu)}
              activeOpacity={0.8}
            >
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitial}>{userInitial}</Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {user?.displayName || (user?.email ? user.email.split('@')[0] : 'Seeker')}
                </Text>
                <Text style={styles.profileSub} numberOfLines={1}>
                  {user?.isAnonymous ? 'Guest' : user?.email || 'Seeker of Wisdom'}
                </Text>
              </View>
              <ChevronRight size={16} color={darkTheme.textMuted} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  drawer: {
    width: DRAWER_WIDTH,
    height: '100%',
    backgroundColor: '#0E1320',
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
    paddingTop: 48,
    display: 'flex',
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  omBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1,
    borderColor: darkTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  omText: {
    color: darkTheme.primary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  brandTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  closeButton: {
    padding: 6,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: darkTheme.primary,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
    shadowColor: darkTheme.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  newChatText: {
    color: '#0B0F19',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeader: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    color: darkTheme.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  conversationsList: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyTitle: {
    color: darkTheme.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    marginTop: 6,
  },
  emptySubtitle: {
    color: darkTheme.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  convItemActive: {
    backgroundColor: '#1E293B',
    borderLeftWidth: 3,
    borderLeftColor: darkTheme.primary,
  },
  convTitle: {
    flex: 1,
    color: darkTheme.textSecondary,
    fontSize: 13,
  },
  convTitleActive: {
    color: '#F8FAFC',
    fontWeight: '600',
  },
  deleteBtn: {
    padding: 4,
    opacity: 0.7,
  },
  profilePopover: {
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  popoverHeader: {
    marginBottom: 8,
  },
  popoverName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  popoverEmail: {
    color: darkTheme.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  popoverDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 8,
  },
  popoverAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  popoverLogoutText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
  },
  profileBar: {
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingBottom: 24,
    backgroundColor: '#0B0F19',
  },
  profileButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: darkTheme.surface,
    borderWidth: 1.5,
    borderColor: darkTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: darkTheme.primary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 10,
  },
  profileName: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  profileSub: {
    color: darkTheme.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
});

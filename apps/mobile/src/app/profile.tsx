import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/auth.store';
import { darkTheme } from '../theme/colors';
import { User, Shield, Trash2, ArrowLeft, Check } from 'lucide-react-native';
import { apiFetch } from '../lib/api-client';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, profile, updatePreferences, logout } = useAuthStore();

  const [preferredName, setPreferredName] = useState(user?.preferredName || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSavePreferredName = async () => {
    if (!preferredName.trim()) return;
    setIsSaving(true);
    try {
      await updatePreferences({ preferredName: preferredName.trim() });
      Alert.alert('Saved', `Krishna will now address you as "${preferredName.trim()}".`);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Release Sanctuary Record',
      'Are you sure you wish to permanently delete your account and all associated reflections and memories? This action cannot be reversed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Permanently Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch('/user/account', { method: 'DELETE' });
              logout();
              router.replace('/(auth)/login');
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header Summary */}
        <View style={styles.avatarCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>
              {(user?.preferredName || 'P').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.userName}>{user?.displayName || 'Seeker of Truth'}</Text>
          <Text style={styles.userEmail}>
            {user?.isAnonymous ? 'Anonymous Session' : user?.email}
          </Text>
        </View>

        {/* Edit Preferred Name */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Conversational Salutation</Text>
          <Text style={styles.sectionHelp}>
            How Krishna may naturally address you during reflection (e.g. Mitra, Sakha, or your chosen name).
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={preferredName}
              onChangeText={setPreferredName}
              placeholder="e.g. Mitra or your name"
              placeholderTextColor={darkTheme.textMuted}
            />
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSavePreferredName}
              disabled={isSaving}
            >
              <Check color="#0B0F19" size={18} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Memory Privacy Guarantee */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & Data Protection</Text>
          <View style={styles.privacyBox}>
            <Shield color={darkTheme.primary} size={20} />
            <Text style={styles.privacyText}>
              Your reflections are never sold or shared with external data brokers. The AI uses your reflections solely to maintain conversational continuity.
            </Text>
          </View>
        </View>

        {/* Danger Zone: Account Deletion */}
        <View style={styles.section}>
          <Text style={styles.dangerTitle}>Danger Zone</Text>
          <TouchableOpacity style={styles.deleteAccountButton} onPress={handleDeleteAccount}>
            <Trash2 color={darkTheme.danger} size={18} />
            <Text style={styles.deleteAccountText}>Delete Account & Data</Text>
          </TouchableOpacity>
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
  avatarCard: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: darkTheme.primaryMuted,
    borderWidth: 1.5,
    borderColor: darkTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarLetter: {
    color: darkTheme.primary,
    fontSize: 30,
    fontWeight: '700',
  },
  userName: {
    color: darkTheme.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  userEmail: {
    color: darkTheme.textSecondary,
    fontSize: 13,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    color: darkTheme.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  sectionHelp: {
    color: darkTheme.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: darkTheme.textPrimary,
    fontSize: 15,
  },
  saveButton: {
    backgroundColor: darkTheme.primary,
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyBox: {
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  privacyText: {
    color: darkTheme.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  dangerTitle: {
    color: darkTheme.danger,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: darkTheme.danger,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
  },
  deleteAccountText: {
    color: darkTheme.danger,
    fontSize: 14,
    fontWeight: '700',
  },
});

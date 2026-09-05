import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/auth.store';
import { darkTheme } from '../../theme/colors';
import {
  Sliders,
  BookOpen,
  User,
  Shield,
  Crown,
  LogOut,
  Trash2,
  ChevronRight,
} from 'lucide-react-native';
import { ReflectionDepth, MahabharataDensity } from '@talk-to-krisna/shared';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, profile, updatePreferences, logout } = useAuthStore();

  const [depth, setDepth] = useState<ReflectionDepth>(profile?.reflectionDepth || 'balanced');
  const [density, setDensity] = useState<MahabharataDensity>(profile?.mahabharataDensity || 'contextual');
  const [memoryEnabled, setMemoryEnabled] = useState(profile?.enableLongTermMemory || false);

  const handleUpdateDepth = async (newDepth: ReflectionDepth) => {
    setDepth(newDepth);
    try {
      await updatePreferences({ reflectionDepth: newDepth });
    } catch (err) {
      console.error('Failed to update depth', err);
    }
  };

  const handleUpdateDensity = async (newDensity: MahabharataDensity) => {
    setDensity(newDensity);
    try {
      await updatePreferences({ mahabharataDensity: newDensity });
    } catch (err) {
      console.error('Failed to update density', err);
    }
  };

  const handleToggleMemory = async (val: boolean) => {
    setMemoryEnabled(val);
    try {
      await updatePreferences({ enableLongTermMemory: val });
    } catch (err) {
      console.error('Failed to update memory setting', err);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you wish to exit your sanctuary?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* User Card */}
        <TouchableOpacity style={styles.profileCard} onPress={() => router.push('/profile')}>
          <View style={styles.avatarCircle}>
            <User color={darkTheme.primary} size={22} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {user?.displayName || (user?.isAnonymous ? 'Guest Seeker' : 'Seeker')}
            </Text>
            <Text style={styles.profileSubtitle}>
              {user?.preferredName ? `Addressed as "${user.preferredName}"` : 'No custom salutation set'}
            </Text>
          </View>
          <ChevronRight color={darkTheme.textMuted} size={18} />
        </TouchableOpacity>

        {/* Reflection Depth Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Contemplation Depth</Text>
          <Text style={styles.sectionHelp}>Control how deeply answers explore underlying philosophy.</Text>
          <View style={styles.optionRow}>
            {(['concise', 'balanced', 'deep_philosophical'] as ReflectionDepth[]).map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.segmentButton, depth === d && styles.segmentButtonActive]}
                onPress={() => handleUpdateDepth(d)}
              >
                <Text style={[styles.segmentText, depth === d && styles.segmentTextActive]}>
                  {d === 'concise' ? 'Concise' : d === 'balanced' ? 'Balanced' : 'Deep'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Mahabharata Scripture Density */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mahabharata Wisdom Density</Text>
          <Text style={styles.sectionHelp}>Control the frequency of explicit verses and story parallels.</Text>
          <View style={styles.optionRow}>
            {(['subtle', 'contextual', 'rich'] as MahabharataDensity[]).map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.segmentButton, density === d && styles.segmentButtonActive]}
                onPress={() => handleUpdateDensity(d)}
              >
                <Text style={[styles.segmentText, density === d && styles.segmentTextActive]}>
                  {d === 'subtle' ? 'Subtle' : d === 'contextual' ? 'Contextual' : 'Rich'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Memory Consent */}
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View style={styles.switchTextContainer}>
              <Text style={styles.switchTitle}>Conversational Memory</Text>
              <Text style={styles.switchSubtitle}>
                Allow Krishna to remember explicit life goals across discussions.
              </Text>
            </View>
            <Switch
              value={memoryEnabled}
              onValueChange={handleToggleMemory}
              trackColor={{ false: darkTheme.surfaceBorder, true: darkTheme.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Navigation Links */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.navRow} onPress={() => router.push('/about')}>
            <View style={styles.navRowLeft}>
              <BookOpen color={darkTheme.primary} size={18} />
              <Text style={styles.navRowText}>Canonical Sources & Translations</Text>
            </View>
            <ChevronRight color={darkTheme.textMuted} size={18} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.navRow} onPress={() => router.push('/subscription')}>
            <View style={styles.navRowLeft}>
              <Crown color={darkTheme.accent} size={18} />
              <Text style={styles.navRowText}>Sadhak Fellowship & Subscription</Text>
            </View>
            <ChevronRight color={darkTheme.textMuted} size={18} />
          </TouchableOpacity>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <LogOut color={darkTheme.textSecondary} size={18} />
            <Text style={styles.logoutText}>Sign Out</Text>
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
  profileCard: {
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 14,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: darkTheme.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: darkTheme.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  profileSubtitle: {
    color: darkTheme.textSecondary,
    fontSize: 13,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: darkTheme.textPrimary,
    marginBottom: 4,
  },
  sectionHelp: {
    fontSize: 13,
    color: darkTheme.textMuted,
    marginBottom: 12,
    lineHeight: 18,
  },
  optionRow: {
    flexDirection: 'row',
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentButtonActive: {
    backgroundColor: darkTheme.primary,
  },
  segmentText: {
    fontSize: 13,
    color: darkTheme.textSecondary,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: '#0B0F19',
    fontWeight: '700',
  },
  switchRow: {
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  switchTitle: {
    color: darkTheme.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  switchSubtitle: {
    color: darkTheme.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  navRow: {
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  navRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navRowText: {
    color: darkTheme.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
  },
  logoutText: {
    color: darkTheme.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});

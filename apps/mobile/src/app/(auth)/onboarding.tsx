import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { darkTheme } from '../../theme/colors';
import { checkBackendHealth } from '../../lib/api-client';

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.title}>Notice</Text>
        <Text style={styles.description}>{error?.message || 'An error occurred.'}</Text>
        <TouchableOpacity style={[styles.actionButton, { marginTop: 24, paddingHorizontal: 32 }]} onPress={retry}>
          <Text style={styles.actionButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();

  React.useEffect(() => {
    checkBackendHealth().catch(() => {});
  }, []);

  const handleStart = () => {
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brandTitle}>Talk to Krishna</Text>
          <TouchableOpacity onPress={handleStart} activeOpacity={0.7}>
            <Text style={styles.skipButton}>Sign In</Text>
          </TouchableOpacity>
        </View>

        {/* Single Welcome Slide */}
        <View style={styles.content}>
          <View style={styles.heroImageContainer}>
            <Image
              source={require('../../../assets/images/krishna-logo.png')}
              style={styles.heroImage}
              resizeMode="cover"
            />
          </View>

          <View style={styles.accentBadge}>
            <Text style={styles.accentBadgeText}>Timeless Guidance</Text>
          </View>

          <Text style={styles.title}>A Guide for Life’s Battlefield</Text>
          <Text style={styles.description}>
            Like Arjuna at Kurukshetra, we all face moments of overwhelm, heartbreak, and difficult moral choices.
            Here, speak your heart freely and receive authentic wisdom drawn from the Mahabharata and Bhagavad Gita.
          </Text>
        </View>

        {/* Action Button */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.actionButton} onPress={handleStart} activeOpacity={0.85}>
            <Text style={styles.actionButtonText}>Get Started</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
  },
  brandTitle: {
    color: darkTheme.primary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  skipButton: {
    color: darkTheme.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    marginVertical: 'auto',
    alignItems: 'center',
  },
  heroImageContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: darkTheme.primary,
    overflow: 'hidden',
    marginBottom: 24,
    alignSelf: 'center',
    shadowColor: darkTheme.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  accentBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: darkTheme.primary,
    marginBottom: 18,
  },
  accentBadgeText: {
    color: darkTheme.primary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#F8FAFC',
    lineHeight: 34,
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: darkTheme.textSecondary,
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  footer: {
    paddingBottom: 24,
  },
  actionButton: {
    backgroundColor: darkTheme.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: darkTheme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  actionButtonText: {
    color: '#0B0F19',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

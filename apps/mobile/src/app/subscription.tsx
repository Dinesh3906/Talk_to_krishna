import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { darkTheme } from '../theme/colors';
import { Crown, Check, Sparkles } from 'lucide-react-native';

export default function SubscriptionScreen() {
  const router = useRouter();

  const handleSelectPlan = (planName: string) => {
    Alert.alert(
      'Sādhak Fellowship',
      `Google Play Billing integration for "${planName}". Subscriptions will be enabled upon Play Store release.`
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <View style={styles.crownCircle}>
            <Crown color={darkTheme.primary} size={36} />
          </View>
          <Text style={styles.title}>Sādhak Fellowship</Text>
          <Text style={styles.subtitle}>
            Deepen your daily communion with timeless wisdom.
          </Text>
        </View>

        {/* Free Plan */}
        <View style={styles.planCard}>
          <Text style={styles.planTitle}>Seeker</Text>
          <Text style={styles.planPrice}>Free</Text>
          <Text style={styles.planDesc}>Essential wisdom for life’s daily questions.</Text>
          <View style={styles.featureList}>
            <View style={styles.featureRow}>
              <Check color={darkTheme.primary} size={16} />
              <Text style={styles.featureText}>Daily reflections and conversations</Text>
            </View>
            <View style={styles.featureRow}>
              <Check color={darkTheme.primary} size={16} />
              <Text style={styles.featureText}>Full canonical scripture citations</Text>
            </View>
            <View style={styles.featureRow}>
              <Check color={darkTheme.primary} size={16} />
              <Text style={styles.featureText}>Reflection depth controls</Text>
            </View>
          </View>
        </View>

        {/* Premium Plan */}
        <View style={[styles.planCard, styles.premiumCard]}>
          <View style={styles.recommendedBadge}>
            <Sparkles color="#0B0F19" size={12} />
            <Text style={styles.recommendedText}>RECOMMENDED</Text>
          </View>
          <Text style={styles.planTitle}>Sādhak</Text>
          <Text style={styles.planPrice}>
            $4.99 <Text style={styles.periodText}>/ month</Text>
          </Text>
          <Text style={styles.planDesc}>Unbounded philosophical depth and guidance.</Text>
          <View style={styles.featureList}>
            <View style={styles.featureRow}>
              <Check color={darkTheme.primary} size={16} />
              <Text style={styles.featureText}>Unlimited daily reflections</Text>
            </View>
            <View style={styles.featureRow}>
              <Check color={darkTheme.primary} size={16} />
              <Text style={styles.featureText}>Deep philosophical synthesis across all 18 Parvas</Text>
            </View>
            <View style={styles.featureRow}>
              <Check color={darkTheme.primary} size={16} />
              <Text style={styles.featureText}>Persistent conversational memory</Text>
            </View>
            <View style={styles.featureRow}>
              <Check color={darkTheme.primary} size={16} />
              <Text style={styles.featureText}>Priority AI inference & future voice guidance</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.subscribeButton}
            onPress={() => handleSelectPlan('Sādhak Monthly')}
          >
            <Text style={styles.subscribeButtonText}>Begin 7-Day Free Trial</Text>
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
  header: {
    alignItems: 'center',
    marginVertical: 20,
  },
  crownCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: darkTheme.primaryMuted,
    borderWidth: 1.5,
    borderColor: darkTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: darkTheme.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: darkTheme.textSecondary,
    textAlign: 'center',
  },
  planCard: {
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
    borderRadius: 18,
    padding: 24,
    marginBottom: 20,
  },
  premiumCard: {
    borderColor: darkTheme.primary,
    borderWidth: 2,
    backgroundColor: '#121A2D',
  },
  recommendedBadge: {
    position: 'absolute',
    top: -12,
    right: 20,
    backgroundColor: darkTheme.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  recommendedText: {
    color: '#0B0F19',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  planTitle: {
    color: darkTheme.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  planPrice: {
    color: darkTheme.primary,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 6,
  },
  periodText: {
    color: darkTheme.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  planDesc: {
    color: darkTheme.textSecondary,
    fontSize: 13,
    marginBottom: 20,
  },
  featureList: {
    gap: 12,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    color: darkTheme.textPrimary,
    fontSize: 14,
    flex: 1,
  },
  subscribeButton: {
    backgroundColor: darkTheme.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  subscribeButtonText: {
    color: '#0B0F19',
    fontSize: 15,
    fontWeight: '700',
  },
});

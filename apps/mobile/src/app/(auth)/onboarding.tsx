import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { darkTheme } from '../../theme/colors';

const SLIDES = [
  {
    step: '01',
    title: 'A Guide for Life’s Battlefield',
    description:
      'Like Arjuna standing bewildered at Kurukshetra, we all face moments of overwhelm, heartbreak, and difficult moral choices. Here, you can speak your heart freely.',
  },
  {
    step: '02',
    title: 'Authoritative Wisdom',
    description:
      'No superficial platitudes or invented quotes. Every insight is drawn from verified canonical sources: the 18 Parvas of the Mahabharata and the Bhagavad Gita.',
  },
  {
    step: '03',
    title: 'Mindful & Private',
    description:
      'A sacred space for contemplation. Your reflections are confidential, and you remain in full control of your data and memory.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentSlide, setCurrentSlide] = useState(0);

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      router.replace('/(auth)/login');
    }
  };

  const slide = SLIDES[currentSlide];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.stepCounter}>{slide.step} / 03</Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.skipButton}>Skip</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.heroImageContainer}>
            <Image
              source={require('../../../assets/images/krishna-logo.png')}
              style={styles.heroImage}
              resizeMode="cover"
            />
          </View>
          <View style={styles.accentBadge}>
            <Text style={styles.accentBadgeText}>Sādhana</Text>
          </View>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.description}>{slide.description}</Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.indicators}>
            {SLIDES.map((_, idx) => (
              <View
                key={idx}
                style={[
                  styles.dot,
                  idx === currentSlide ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>

          <TouchableOpacity style={styles.actionButton} onPress={handleNext}>
            <Text style={styles.actionButtonText}>
              {currentSlide === SLIDES.length - 1 ? 'Enter Sanctuary' : 'Continue'}
            </Text>
          </TouchableOpacity>
        </View>
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
    padding: 24,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
  },
  stepCounter: {
    color: darkTheme.primary,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
  },
  skipButton: {
    color: darkTheme.textSecondary,
    fontSize: 14,
  },
  content: {
    marginVertical: 'auto',
  },
  heroImageContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: '#F59E0B',
    overflow: 'hidden',
    marginBottom: 24,
    alignSelf: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  accentBadge: {
    alignSelf: 'flex-start',
    backgroundColor: darkTheme.primaryMuted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: darkTheme.primary,
    marginBottom: 20,
  },
  accentBadgeText: {
    color: darkTheme.primaryLight,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: darkTheme.textPrimary,
    lineHeight: 38,
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: darkTheme.textSecondary,
    lineHeight: 26,
  },
  footer: {
    paddingBottom: 24,
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    marginHorizontal: 4,
  },
  dotActive: {
    width: 24,
    backgroundColor: darkTheme.primary,
  },
  dotInactive: {
    width: 6,
    backgroundColor: darkTheme.surfaceBorder,
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

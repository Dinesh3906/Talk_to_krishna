import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { darkTheme } from '../theme/colors';
import { BookOpen, Shield, ArrowLeft, ExternalLink, Sparkles } from 'lucide-react-native';
import { apiFetch } from '../lib/api-client';
import { ParvaInfo } from '@talk-to-krisna/shared';

export default function AboutSourcesScreen() {
  const router = useRouter();
  const [parvas, setParvas] = useState<ParvaInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSources() {
      try {
        const data: ParvaInfo[] = await apiFetch('/sources/parvas');
        setParvas(data);
      } catch (err) {
        console.error('Failed to load Parvas overview', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadSources();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badge}>
            <Sparkles color={darkTheme.primary} size={14} />
            <Text style={styles.badgeText}>CANONICAL GROUNDING</Text>
          </View>
          <Text style={styles.title}>The Epic Corpus</Text>
          <Text style={styles.subtitle}>
            Every reflection is rooted in the 18 Parvas of the Mahabharata and the 700 verses of the Bhagavad Gita.
          </Text>
        </View>

        {/* AI Transparency & Safety Disclaimer */}
        <View style={styles.disclaimerBox}>
          <View style={styles.disclaimerHeader}>
            <Shield color={darkTheme.primary} size={18} />
            <Text style={styles.disclaimerTitle}>Transparency & Safety Pledge</Text>
          </View>
          <Text style={styles.disclaimerText}>
            This application is an educational, philosophical, and reflective conversational AI experience inspired by the teachings of Lord Krishna.
          </Text>
          <Text style={styles.disclaimerBullet}>
            • <Text style={styles.bold}>Zero Fabricated Scripture:</Text> The AI is strictly prohibited from inventing verses or attributing fabricated quotes to Krishna or ancient sages.
          </Text>
          <Text style={styles.disclaimerBullet}>
            • <Text style={styles.bold}>Not a Supernatural Entity:</Text> The application does not claim to possess supernatural powers or divine authority.
          </Text>
          <Text style={styles.disclaimerBullet}>
            • <Text style={styles.bold}>Professional Care:</Text> In clinical emergencies, mental health distress, or legal/financial decisions, please consult certified human professionals.
          </Text>
        </View>

        {/* 18 Parvas Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>The 18 Books (Parvas)</Text>
          <Text style={styles.sectionHelp}>
            The architecture preserves the narrative arc, dialogue contexts, and philosophical discourses across all 18 Parvas.
          </Text>

          {isLoading ? (
            <ActivityIndicator color={darkTheme.primary} style={{ marginVertical: 24 }} />
          ) : (
            parvas.map((parva) => (
              <View key={parva.id} style={styles.parvaCard}>
                <View style={styles.parvaHeader}>
                  <Text style={styles.parvaNumber}>Parva {parva.id}</Text>
                  <Text style={styles.parvaName}>{parva.name}</Text>
                </View>
                <Text style={styles.parvaMeaning}>{parva.englishMeaning}</Text>
                <Text style={styles.parvaDesc}>{parva.description}</Text>
                <View style={styles.themeTagsRow}>
                  {parva.keyThemes?.slice(0, 4).map((t, idx) => (
                    <View key={idx} style={styles.themeTag}>
                      <Text style={styles.themeTagText}>{t}</Text>
                    </View>
                  ))}
                </View>
              </View>
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
    marginBottom: 24,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: darkTheme.primaryMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  badgeText: {
    color: darkTheme.primaryLight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: darkTheme.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: darkTheme.textSecondary,
    lineHeight: 22,
  },
  disclaimerBox: {
    backgroundColor: darkTheme.krishnaBubble,
    borderColor: darkTheme.krishnaBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginBottom: 28,
  },
  disclaimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  disclaimerTitle: {
    color: darkTheme.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  disclaimerText: {
    color: darkTheme.textPrimary,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10,
  },
  disclaimerBullet: {
    color: darkTheme.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
  bold: {
    color: darkTheme.textPrimary,
    fontWeight: '600',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: darkTheme.textPrimary,
    marginBottom: 4,
  },
  sectionHelp: {
    fontSize: 13,
    color: darkTheme.textMuted,
    lineHeight: 18,
    marginBottom: 16,
  },
  parvaCard: {
    backgroundColor: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  parvaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  parvaNumber: {
    color: darkTheme.primary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  parvaName: {
    color: darkTheme.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  parvaMeaning: {
    color: darkTheme.accent,
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  parvaDesc: {
    color: darkTheme.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  themeTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  themeTag: {
    backgroundColor: darkTheme.surfaceHover,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  themeTagText: {
    color: darkTheme.textMuted,
    fontSize: 11,
  },
});

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store';
import { darkTheme } from '../theme/colors';

const queryClient = new QueryClient();

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={styles.errorContainer}>
      <View style={styles.errorIconCircle}>
        <Text style={styles.errorOm}>ॐ</Text>
      </View>
      <Text style={styles.errorTitle}>Sanctuary Interruption</Text>
      <Text style={styles.errorMessage}>
        {error?.message || 'An unexpected occurrence paused the dialogue.'}
      </Text>
      <TouchableOpacity style={styles.retryButton} onPress={retry} activeOpacity={0.8}>
        <Text style={styles.retryText}>Restore Connection</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor="#0B0F19" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#0B0F19' },
            headerTintColor: '#D4AF37',
            headerTitleStyle: { fontWeight: '600', color: '#F8FAFC' },
            contentStyle: { backgroundColor: '#0B0F19' },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
          <Stack.Screen name="chat" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="conversations/[id]" options={{ title: 'Reflection Record' }} />
          <Stack.Screen name="profile" options={{ title: 'Seeker Profile' }} />
          <Stack.Screen name="subscription" options={{ title: 'Sadhak Fellowship' }} />
          <Stack.Screen name="about" options={{ title: 'Canonical Sources' }} />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: '#0B0F19',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#161F30',
    borderColor: '#D4AF37',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  errorOm: {
    fontSize: 28,
    color: '#D4AF37',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 10,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    lineHeight: 22,
    color: '#94A3B8',
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  retryText: {
    color: '#0B0F19',
    fontWeight: '700',
    fontSize: 15,
  },
});


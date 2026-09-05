import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store';

const queryClient = new QueryClient();

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
          <Stack.Screen name="(auth)/onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
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

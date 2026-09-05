import React from 'react';
import { Tabs } from 'expo-router';
import { darkTheme } from '../../theme/colors';
import { Home, MessageSquare, Settings } from 'lucide-react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: darkTheme.background, borderBottomColor: darkTheme.surfaceBorder },
        headerTintColor: darkTheme.primary,
        headerTitleStyle: { fontWeight: '600', color: darkTheme.textPrimary },
        tabBarStyle: {
          backgroundColor: darkTheme.surface,
          borderTopColor: darkTheme.surfaceBorder,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: darkTheme.primary,
        tabBarInactiveTintColor: darkTheme.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Sanctuary',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="conversations"
        options={{
          title: 'Reflections',
          tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} />,
          headerTitle: 'Past Reflections',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
          headerTitle: 'Preferences & Sources',
        }}
      />
    </Tabs>
  );
}

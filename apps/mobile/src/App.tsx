// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import React, { useEffect } from 'react';
import { NavigationContainer, DarkTheme, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { ChatScreen } from '@/screens/ChatScreen';
import { SessionsScreen } from '@/screens/SessionsScreen';
import { SchedulesScreen } from '@/screens/SchedulesScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { useAuthStore } from '@/stores/useAuthStore';
import { useChatStore } from '@/stores/useChatStore';
import { useScheduleStore } from '@/stores/useScheduleStore';
import { useRemoteEvents } from '@/hooks/useRemoteEvents';
import { colors } from '@/theme/colors';

type RootTabs = {
  Chat: undefined;
  Sessions: undefined;
  Schedules: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabs>();

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bgElevated,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

function SplashScreen(): React.JSX.Element {
  return (
    <View style={styles.splash}>
      <ActivityIndicator color="#93C5FD" />
      <Text style={styles.splashText}>Connecting to Cowork...</Text>
    </View>
  );
}

function MainTabs(): React.JSX.Element {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: '#DBEAFE',
        tabBarInactiveTintColor: colors.textDim,
      }}
    >
      <Tab.Screen name="Chat" component={ChatScreen} />
      <Tab.Screen name="Sessions" component={SessionsScreen} />
      <Tab.Screen name="Schedules" component={SchedulesScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function AppRoot(): React.JSX.Element {
  const hydrated = useAuthStore((state) => state.hydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const resetChat = useChatStore((state) => state.reset);
  const resetSchedules = useScheduleStore((state) => state.reset);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!isAuthenticated) {
      resetChat();
      resetSchedules();
    }
  }, [isAuthenticated, resetChat, resetSchedules]);

  useRemoteEvents();

  if (!hydrated) {
    return (
      <>
        <StatusBar style="light" />
        <SplashScreen />
      </>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="light" />
      {isAuthenticated ? (
        <MainTabs />
      ) : (
        <OnboardingScreen onPaired={() => { /* state changes in store */ }} />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  splashText: {
    color: colors.textMuted,
    fontSize: 13,
  },
});

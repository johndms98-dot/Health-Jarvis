import { Component, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { initHealthKit } from '../src/services/HealthKitService';
import { C } from '../constants/Theme';

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={eb.root}>
          <Text style={eb.title}>Something went wrong</Text>
          <ScrollView style={eb.scroll}>
            <Text style={eb.message}>{this.state.error.message}</Text>
            <Text style={eb.stack}>{this.state.error.stack}</Text>
          </ScrollView>
          <TouchableOpacity style={eb.btn} onPress={() => this.setState({ error: null })}>
            <Text style={eb.btnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const eb = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060b18', padding: 24, paddingTop: 80, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#ef4444', marginBottom: 16 },
  scroll: { flex: 1, marginBottom: 20 },
  message: { fontSize: 16, color: '#f1f5f9', marginBottom: 12 },
  stack: { fontSize: 11, color: '#64748b', lineHeight: 16 },
  btn: { backgroundColor: '#06b6d4', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnText: { color: '#060b18', fontSize: 16, fontWeight: '700' },
});

export default function RootLayout() {
  useEffect(() => {
    initHealthKit();
  }, []);

  return (
    <ErrorBoundary>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="goals"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="history"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack>
    </ErrorBoundary>
  );
}

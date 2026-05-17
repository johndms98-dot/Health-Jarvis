import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { initHealthKit } from '../src/services/HealthKitService';

export default function RootLayout() {
  useEffect(() => {
    initHealthKit();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

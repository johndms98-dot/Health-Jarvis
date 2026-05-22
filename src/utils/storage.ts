/**
 * Cross-platform key-value storage.
 * Native: expo-secure-store (encrypted)
 * Web:    localStorage (browser)
 */
import { Platform } from 'react-native';

let SecureStore: typeof import('expo-secure-store') | null = null;
if (Platform.OS !== 'web') {
  SecureStore = require('expo-secure-store');
}

export const Storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return SecureStore!.getItemAsync(key);
  },

  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    await SecureStore!.setItemAsync(key, value);
  },

  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    await SecureStore!.deleteItemAsync(key);
  },
};

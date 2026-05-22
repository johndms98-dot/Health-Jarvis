// Apple HealthKit — only available in a native EAS build, not Expo Go.
// Returns empty data in all cases until an EAS development build is installed.
import { HealthSnapshot } from '../models/HealthSnapshot';

export async function initHealthKit(): Promise<boolean> {
  return false;
}

export async function fetchHealthKitData(_date: string): Promise<Partial<HealthSnapshot>> {
  return {};
}

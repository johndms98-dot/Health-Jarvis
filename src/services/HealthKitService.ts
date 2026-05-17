import AppleHealthKit, { HealthKitPermissions, HealthUnit } from 'react-native-health';
import { Platform } from 'react-native';
import { HealthSnapshot } from '../models/HealthSnapshot';

const PERMISSIONS: HealthKitPermissions = {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.StepCount,
      AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
      AppleHealthKit.Constants.Permissions.BodyMass,
      AppleHealthKit.Constants.Permissions.MindfulSession,
      AppleHealthKit.Constants.Permissions.AppleExerciseTime,
      AppleHealthKit.Constants.Permissions.BloodGlucose,
    ],
    write: [],
  },
};

let initialized = false;

export async function initHealthKit(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return new Promise((resolve) => {
    AppleHealthKit.initHealthKit(PERMISSIONS, (err) => {
      initialized = !err;
      resolve(initialized);
    });
  });
}

function dateRange(date: string) {
  return {
    startDate: `${date}T00:00:00.000Z`,
    endDate: `${date}T23:59:59.000Z`,
  };
}

export async function fetchHealthKitData(date: string): Promise<Partial<HealthSnapshot>> {
  if (!initialized || Platform.OS !== 'ios') return {};
  const snap: Partial<HealthSnapshot> = {};

  // Mindful minutes
  await new Promise<void>((resolve) => {
    AppleHealthKit.getMindfulSession(dateRange(date), (err, results) => {
      if (!err && results) {
        snap.mindfulMinutes = results.reduce((sum: number, r: any) => {
          const mins = (new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / 60000;
          return sum + mins;
        }, 0);
      }
      resolve();
    });
  });

  // Apple Exercise Time (stand-in for workout minutes from iPhone)
  await new Promise<void>((resolve) => {
    AppleHealthKit.getAppleExerciseTime(dateRange(date), (err, results) => {
      if (!err && Array.isArray(results)) {
        snap.workoutMinutes = results.reduce((sum: number, r: any) => sum + (r.value ?? 0), 0);
      }
      resolve();
    });
  });

  return snap;
}

export interface HealthSnapshot {
  date: string; // YYYY-MM-DD

  // Garmin — direct from Garmin Connect
  steps?: number;
  bodyBattery?: number;        // 0-100, Garmin proprietary
  restingHeartRate?: number;   // bpm
  hrv?: number;                // RMSSD ms
  sleepHours?: number;
  sleepScore?: number;         // Garmin score 0-100
  deepSleepHours?: number;
  lightSleepHours?: number;
  remSleepHours?: number;
  awakeHours?: number;
  spo2?: number;               // SpO2 %
  avgStress?: number;          // 0-100
  respirationAvg?: number;     // breaths/min
  activeCalories?: number;
  totalCalories?: number;

  // Withings — direct from Withings API
  weightKg?: number;
  bmi?: number;
  bodyFatPct?: number;
  muscleMassKg?: number;
  boneMassKg?: number;
  hydrationPct?: number;
  systolic?: number;           // blood pressure
  diastolic?: number;

  // Nutrition — MFP direct
  caloriesConsumed?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
  waterCups?: number;

  // Apple Health — supplemental
  mindfulMinutes?: number;
  workoutMinutes?: number;
  standHours?: number;
}

export interface Activity {
  id: string;
  name: string;
  type: string;
  date: string;
  durationMinutes: number;
  distanceKm?: number;
  avgHeartRate?: number;
  calories?: number;
}

export interface AIInsight {
  text: string;
  generatedAt: string;
  basedOnDays: number;
}

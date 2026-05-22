// Garmin proxy — Railway cloud (always on, works anywhere)
// Set EXPO_PUBLIC_GARMIN_PROXY in .env.local to your Railway URL
export const GARMIN_PROXY = process.env.EXPO_PUBLIC_GARMIN_PROXY
  ?? `http://${process.env.EXPO_PUBLIC_MAC_HOST ?? '192.168.1.158'}:8765`;

// Withings OAuth
export const WITHINGS_CLIENT_ID     = process.env.EXPO_PUBLIC_WITHINGS_CLIENT_ID ?? '';
export const WITHINGS_CLIENT_SECRET = process.env.EXPO_PUBLIC_WITHINGS_CLIENT_SECRET ?? '';
export const WITHINGS_REDIRECT_URI  = 'healthdashboard://withings-auth';

// Supabase — cloud database for food logs, goals, health history
export const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// USDA FoodData Central — free food database API
// Get a free key at: https://fdc.nal.usda.gov/api-key-signup.html
export const USDA_API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY ?? 'DEMO_KEY';

// Set MAC_HOST to your Mac's local IP address (find it in System Settings > Wi-Fi > Details)
// This is used when the app and Mac are on the same Wi-Fi network.
export const MAC_HOST = process.env.EXPO_PUBLIC_MAC_HOST ?? '192.168.1.100';
export const GARMIN_PROXY = `http://${MAC_HOST}:8765`;
export const MFP_PROXY = `http://${MAC_HOST}:8766`;

// AI insights run via Ollama on your Mac — no API key, completely free.
// The /insights endpoint on the Garmin proxy forwards requests to Ollama (llama3.1:8b).
export const LLM_MODEL = 'llama3.1:8b';

export const WITHINGS_CLIENT_ID = process.env.EXPO_PUBLIC_WITHINGS_CLIENT_ID ?? '';
export const WITHINGS_CLIENT_SECRET = process.env.EXPO_PUBLIC_WITHINGS_CLIENT_SECRET ?? '';
export const WITHINGS_REDIRECT_URI = 'healthdashboard://withings-auth';

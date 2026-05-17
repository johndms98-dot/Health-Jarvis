import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { WITHINGS_CLIENT_ID, WITHINGS_CLIENT_SECRET, WITHINGS_REDIRECT_URI } from '../../constants/Config';
import { HealthSnapshot } from '../models/HealthSnapshot';

const TOKEN_KEY = 'withings_tokens';
const WITHINGS_API = 'https://wbsapi.withings.net';
const WITHINGS_AUTH = 'https://account.withings.com/oauth2_user/authorize2';
const WITHINGS_TOKEN = 'https://wbsapi.withings.net/v2/oauth2';

interface Tokens { access_token: string; refresh_token: string; expires_at: number; }

async function getTokens(): Promise<Tokens | null> {
  const raw = await SecureStore.getItemAsync(TOKEN_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function saveTokens(tokens: Tokens) {
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens));
}

async function refreshIfNeeded(tokens: Tokens): Promise<Tokens> {
  if (Date.now() < tokens.expires_at - 60_000) return tokens;
  const res = await fetch(WITHINGS_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'refresh_token',
      client_id: WITHINGS_CLIENT_ID,
      client_secret: WITHINGS_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
    }).toString(),
  });
  const data = await res.json();
  const fresh: Tokens = {
    access_token: data.body.access_token,
    refresh_token: data.body.refresh_token,
    expires_at: Date.now() + data.body.expires_in * 1000,
  };
  await saveTokens(fresh);
  return fresh;
}

export async function isAuthenticated(): Promise<boolean> {
  const tokens = await getTokens();
  return tokens !== null;
}

export async function authenticate(): Promise<boolean> {
  const state = Math.random().toString(36).slice(2);
  const url = `${WITHINGS_AUTH}?response_type=code&client_id=${WITHINGS_CLIENT_ID}&redirect_uri=${encodeURIComponent(WITHINGS_REDIRECT_URI)}&scope=user.metrics,user.activity&state=${state}`;

  const result = await WebBrowser.openAuthSessionAsync(url, WITHINGS_REDIRECT_URI);
  if (result.type !== 'success') return false;

  const parsed = Linking.parse(result.url);
  const code = parsed.queryParams?.code as string;
  if (!code) return false;

  const res = await fetch(WITHINGS_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'authorization_code',
      client_id: WITHINGS_CLIENT_ID,
      client_secret: WITHINGS_CLIENT_SECRET,
      code,
      redirect_uri: WITHINGS_REDIRECT_URI,
    }).toString(),
  });
  const data = await res.json();
  if (!data.body?.access_token) return false;

  await saveTokens({
    access_token: data.body.access_token,
    refresh_token: data.body.refresh_token,
    expires_at: Date.now() + data.body.expires_in * 1000,
  });
  return true;
}

async function apiCall(endpoint: string, params: Record<string, string>): Promise<any> {
  let tokens = await getTokens();
  if (!tokens) throw new Error('Not authenticated with Withings');
  tokens = await refreshIfNeeded(tokens);

  const res = await fetch(`${WITHINGS_API}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${tokens.access_token}`,
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (data.status !== 0) throw new Error(`Withings API error: ${data.status}`);
  return data.body;
}

export async function fetchLatestMeasurements(): Promise<Partial<HealthSnapshot>> {
  // meastype: 1=weight, 6=fat%, 5=fat mass, 76=muscle, 88=bone, 71=hydration, 9=bmi, 10=systolic, 11=diastolic
  const body = await apiCall('/measure', { action: 'getmeas', meastype: '1,6,5,76,88,71,9,10,11', category: '1', lastupdate: String(Math.floor((Date.now() - 7 * 86400000) / 1000)) });

  const snap: Partial<HealthSnapshot> = {};
  for (const group of body.measuregrps ?? []) {
    for (const m of group.measures ?? []) {
      const val = m.value * Math.pow(10, m.unit);
      switch (m.type) {
        case 1: snap.weightKg = val; break;
        case 6: snap.bodyFatPct = val; break;
        case 76: snap.muscleMassKg = val; break;
        case 88: snap.boneMassKg = val; break;
        case 71: snap.hydrationPct = val; break;
        case 9: snap.bmi = val; break;
        case 10: snap.systolic = val; break;
        case 11: snap.diastolic = val; break;
      }
    }
  }
  return snap;
}

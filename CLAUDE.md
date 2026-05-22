# Health Jarvis — Personal AI Health Dashboard

Native iOS app (EAS Build) consolidating Garmin + Apple Health + Withings + own food logs,
powered by Groq AI. Runs 100% in the cloud — no Mac/home WiFi dependency.

## ⚠️ HARD RULE — Cloud-Only Architecture

**Never suggest or set up anything that requires the user's Mac to be running.**
This app must work as a fully standalone iPhone app at all times.

- ✅ Allowed: Render.com, Supabase, Groq, EAS Build, any cloud-hosted service
- ❌ Never: Ollama, local Python servers, local proxies, `uvicorn` on Mac, anything on `localhost`, any process that requires the Mac to be on
- If a feature needs a backend, use Render.com (free tier) — same pattern as the Garmin proxy

## Data Sources

| Source | Method | Key metrics |
|---|---|---|
| Garmin | Python proxy on Render.com (free) | Steps, body battery, sleep stages, HRV, SpO2, stress, RHR, respiration |
| Apple Health | react-native-health (native) | Steps, sleep, HR, HRV, mindfulness, workouts — cross-checked vs Garmin |
| Withings | Direct Withings Health API (OAuth in app) | Weight, body fat %, muscle mass |
| Food | Own barcode scanner → Open Food Facts + USDA + Supabase | All macros + micros |
| AI | Gemini 2.0 Flash via Render proxy | Morning brief, insights, deep analysis |

## Key Files

- `src/services/GarminService.ts` — fetches from Render cloud proxy, parses Garmin JSON
- `src/services/FoodDatabaseService.ts` — barcode lookup (Open Food Facts → USDA → custom DB)
- `src/services/SupabaseService.ts` — food logs, health snapshot cache, goals, insights history
- `src/services/DataResolutionService.ts` — per-metric Garmin vs Apple Health resolution logic
- `src/services/AIOptimizationService.ts` — recovery score, daily brief, deep trend analysis
- `src/services/LLMService.ts` — 7-day insights via Gemini (calls /insights on Render proxy)
- `src/services/WithingsService.ts` — OAuth flow + Withings REST API
- `src/services/HealthKitService.ts` — Apple Health supplemental data
- `src/hooks/useHealthData.ts` — orchestrates all sources → HealthSnapshot[], caches to Supabase
- `src/store/healthStore.ts` — Zustand global state
- `app/(tabs)/index.tsx` — Dashboard (Vitality Score + metrics + activities)
- `app/(tabs)/nutrition.tsx` — Food logger with barcode scanner
- `app/(tabs)/insights.tsx` — AI insights (morning brief + weekly + deep analysis)

## Cloud Infrastructure (all free)

| Service | Purpose | URL |
|---|---|---|
| Render.com (free) | Garmin proxy + Gemini AI | https://health-jarvis.onrender.com |
| Supabase (free) | PostgreSQL DB | optaeyajouxqkirmtngl.supabase.co |
| UptimeRobot (free) | Keep Render awake | Ping /health every 5 min |
| GitHub | Source control | johndms98-dot/Health-Jarvis |

**Render free tier note**: Sleeps after 15 min idle, ~50s cold start. UptimeRobot keeps it warm.

## Running Locally (dev build)

```bash
# Requires the EAS dev build installed on iPhone (one-time via EAS Build)
npx expo start --dev-client
# Scan QR code with dev build app (NOT Expo Go)
```

## EAS Build (rebuild after native changes)

```bash
eas build --profile development --platform ios
# Download IPA → AirDrop → iPhone → Settings > Trust
```

## Proxy Endpoints (Render)

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Keep-alive ping |
| `/garmin/snapshot/{date}` | GET | Steps, HRV, sleep, body battery, stress, SpO2 |
| `/garmin/activities` | GET | Recent activities |
| `/insights` | POST | 7-day AI analysis (Gemini 2.0 Flash) |
| `/optimize` | POST | Daily morning brief — recovery + targets |
| `/deep-insights` | POST | 30-90 day deep trend analysis |
| `/meals` | POST | AI meal suggestions from ingredients |

## Vitality Score (home screen widget)

0-100 composite score:
- Sleep: 30% (hours vs goal)
- Body Battery: 25% (Garmin 0-100)
- Nutrition: 20% (calories + protein vs targets)
- Steps: 15% (% of daily goal)
- HRV: 10% (absolute RMSSD ms threshold)

## UptimeRobot Setup

1. Go to uptimerobot.com → Create free account
2. New Monitor → HTTP(S)
3. URL: `https://health-jarvis.onrender.com/health`
4. Interval: 5 minutes
5. Done — Render service stays warm 24/7

## Secrets

- `.env.local` — GITIGNORED. Contains EXPO_PUBLIC_GARMIN_PROXY, SUPABASE keys, GEMINI_API_KEY
- `proxy/.env` — GITIGNORED. Contains GARMIN_EMAIL, GARMIN_PASSWORD, GEMINI_API_KEY (on Render, set as env vars in dashboard)

## Goals Screen (app)

Set in-app → saved to Supabase `goals` table. Includes:
- Primary goal: weight_loss / race_pace / muscle_gain / general_health
- Race details (distance, target pace, date) for race training optimization
- Daily nutrition targets, step goal, sleep goal
- Current and target weight

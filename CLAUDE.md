# Health Dashboard

Personal iPhone app consolidating direct Garmin + Withings + MyFitnessPal data with Claude AI insights.
Built with Expo React Native. No Xcode required — cloud builds via EAS Build.

## Data Sources

| Source | Method | Key metrics |
|---|---|---|
| Garmin | Mac proxy (`proxy/garmin_proxy.py`, port 8765) | Steps, body battery, sleep stages, HRV, SpO2, stress, RHR, respiration |
| MyFitnessPal | Mac proxy (`proxy/mfp_proxy.py`, port 8766) | Calories, macros, per-meal breakdown, water |
| Withings | Direct Withings Health API (OAuth in app) | Weight, body fat %, muscle mass, bone mass, hydration, BP |
| Apple Health | react-native-health in app | Mindfulness, exercise time (supplemental) |

## Key Files

- `src/services/GarminService.ts` — fetches from Mac proxy, parses Garmin Connect JSON
- `src/services/MFPService.ts` — fetches from Mac proxy, parses MFP data
- `src/services/WithingsService.ts` — OAuth flow + Withings REST API
- `src/services/ClaudeService.ts` — Anthropic API, claude-sonnet-4-6, prompt caching
- `src/services/HealthKitService.ts` — Apple Health supplemental data
- `src/hooks/useHealthData.ts` — orchestrates all sources into HealthSnapshot[]
- `src/store/healthStore.ts` — Zustand global state
- `app/(tabs)/index.tsx` — Dashboard screen
- `app/(tabs)/nutrition.tsx` — Nutrition screen
- `app/(tabs)/insights.tsx` — Claude AI insights screen

## Running Locally

```bash
# 1. Start Mac proxies (run this on your Mac first)
bash proxy/start.sh

# 2. Start Expo dev server
npm start

# 3. Scan QR code with Expo Go app on iPhone
# NOTE: HealthKit features require an EAS development build, not Expo Go
```

## EAS Build (for HealthKit / full app)

```bash
npm install -g eas-cli
eas login                                    # create free account at expo.dev
eas build --profile development --platform ios   # cloud build, ~10 min
# Download IPA link from email → AirDrop to iPhone → Settings > Trust developer
```

## Secrets

- `.env.local` — GITIGNORED. Copy from `.env.example` and fill in values.
- `proxy/.env` — GITIGNORED. Copy from `proxy/.env.example` and fill in Garmin/MFP credentials.
- Find your Mac's local IP: System Settings > Wi-Fi > Details > IP Address

## AI Insights (100% Free — Ollama)

Uses `llama3.1:8b` via Ollama running locally on your Mac. Same model as alpaca-trader.
The `/insights` POST endpoint on `garmin_proxy.py` calls `http://localhost:11434/api/generate`
and returns the response. The app calls `GARMIN_PROXY/insights` — no API key needed.
See `src/services/LLMService.ts` and the `generate_insights` endpoint in `proxy/garmin_proxy.py`.

## Withings Setup

1. Register a free developer app at developer.withings.com
2. Set redirect URI to `healthdashboard://withings-auth`
3. Add client ID and secret to `.env.local`
4. Tap "Connect Withings" in the app to complete OAuth

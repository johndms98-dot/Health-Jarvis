import os
import json
import asyncio
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from garminconnect import Garmin, GarminConnectAuthenticationError
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Garmin Proxy")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Garmin client ─────────────────────────────────────────────────────────────

try:
    client = Garmin(os.environ["GARMIN_EMAIL"], os.environ["GARMIN_PASSWORD"])
    client.login()
    print("Garmin login successful")
except GarminConnectAuthenticationError as e:
    print(f"Garmin login failed: {e}")
    client = None
except Exception as e:
    print(f"Garmin init error: {e}")
    client = None

def require_client():
    if client is None:
        raise HTTPException(status_code=503, detail="Garmin client not authenticated")
    return client

# ── Gemini AI ─────────────────────────────────────────────────────────────────

import google.generativeai as genai

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-2.0-flash"  # best free model: 1M token context, fast, multimodal

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

async def call_gemini(prompt: str, max_tokens: int = 1024) -> str:
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not configured")
    model = genai.GenerativeModel(
        GEMINI_MODEL,
        generation_config=genai.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=0.7,
        ),
    )
    # Run in thread pool to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, model.generate_content, prompt)
    return response.text

# ── Garmin endpoints ──────────────────────────────────────────────────────────

@app.get("/garmin/snapshot/{date_str}")
def get_snapshot(date_str: str):
    c = require_client()
    result = {"date": date_str}
    try: result["steps"]       = c.get_steps_data(date_str)
    except Exception: result["steps"] = None
    try: result["sleep"]       = c.get_sleep_data(date_str)
    except Exception: result["sleep"] = None
    try: result["hrv"]         = c.get_hrv_data(date_str)
    except Exception: result["hrv"] = None
    try: result["body_battery"] = c.get_body_battery(date_str)
    except Exception: result["body_battery"] = None
    try: result["heart_rate"]  = c.get_heart_rates(date_str)
    except Exception: result["heart_rate"] = None
    try: result["stress"]      = c.get_stress_data(date_str)
    except Exception: result["stress"] = None
    try: result["respiration"] = c.get_respiration_data(date_str)
    except Exception: result["respiration"] = None
    return result

@app.get("/garmin/activities")
def get_activities(limit: int = 10):
    return require_client().get_activities(0, limit)

@app.get("/garmin/sleep/{date_str}")
def get_sleep(date_str: str):
    return require_client().get_sleep_data(date_str)

@app.get("/garmin/hrv/{date_str}")
def get_hrv(date_str: str):
    return require_client().get_hrv_data(date_str)

# ── AI endpoints ──────────────────────────────────────────────────────────────

class InsightRequest(BaseModel):
    snapshots: list[dict]
    goals: dict = {}

class MealRequest(BaseModel):
    ingredients: list[str]
    today_snapshot: dict = {}
    goals: dict = {}

HEALTH_COACH_PROMPT = """You are a personal health coach reviewing one week of data from someone's Garmin watch and MyFitnessPal food log. Identify patterns, flag concerns, and give 3-5 specific, actionable recommendations. Reference actual numbers. Be concise, speak directly to the user as "you". No bullet points or headers — short paragraphs only."""

@app.post("/insights")
async def generate_insights(req: InsightRequest):
    lines = []
    for s in req.snapshots:
        parts = [f"Date: {s.get('date', '?')}"]
        if s.get("steps"):            parts.append(f"Steps: {s['steps']:,}")
        if s.get("bodyBattery"):      parts.append(f"Body Battery: {s['bodyBattery']}/100")
        if s.get("sleepHours"):       parts.append(f"Sleep: {s['sleepHours']:.1f}h (score {s.get('sleepScore','?')}, deep {s.get('deepSleepHours','?')}h, REM {s.get('remSleepHours','?')}h)")
        if s.get("hrv"):              parts.append(f"HRV: {s['hrv']}ms")
        if s.get("restingHeartRate"): parts.append(f"RHR: {s['restingHeartRate']}bpm")
        if s.get("avgStress"):        parts.append(f"Stress: {s['avgStress']}/100")
        if s.get("weightKg"):         parts.append(f"Weight: {s['weightKg']:.1f}kg")
        if s.get("caloriesConsumed"): parts.append(f"Nutrition: {s['caloriesConsumed']}kcal | P:{s.get('proteinG','?')}g C:{s.get('carbsG','?')}g F:{s.get('fatG','?')}g")
        lines.append(" | ".join(parts))

    g = req.goals
    goals_ctx = ""
    if g:
        goals_ctx = f"\n\nUser's weekly goals: steps/day={g.get('dailySteps','?')}, sleep={g.get('sleepHours','?')}h, calories={g.get('dailyCalories','?')}, protein={g.get('proteinG','?')}g"
        if g.get("targetWeightLbs"):
            goals_ctx += f", target weight={g['targetWeightLbs']}lbs"

    prompt = f"{HEALTH_COACH_PROMPT}\n\nHere is my health data for the past week:\n\n" + "\n".join(lines) + goals_ctx + "\n\nPlease give me your analysis and recommendations."

    try:
        text = await call_gemini(prompt)
        return {"text": text, "model": GEMINI_MODEL}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI error: {e}")

@app.post("/meals")
async def suggest_meals(req: MealRequest):
    s = req.today_snapshot
    g = req.goals

    active_cal = s.get("activeCalories") or 0
    steps = s.get("steps") or 0
    high_step_bonus = 50 if steps > 12000 else 0
    total_extra = active_cal + high_step_bonus

    base_cal     = g.get("dailyCalories", 2000)
    base_protein = g.get("proteinG", 150)
    base_carbs   = g.get("carbsG", 200)

    adj_cal     = round(base_cal + total_extra * 0.7)
    adj_protein = round(base_protein + total_extra * 0.04)
    adj_carbs   = round(base_carbs + total_extra * 0.12)

    eaten_cal    = s.get("caloriesConsumed") or 0
    eaten_protein = s.get("proteinG") or 0
    eaten_carbs  = s.get("carbsG") or 0
    eaten_fat    = s.get("fatG") or 0

    remaining_cal     = max(adj_cal - eaten_cal, 0)
    remaining_protein = max(adj_protein - eaten_protein, 0)

    weight_note = ""
    if g.get("currentWeightLbs") and g.get("targetWeightLbs"):
        diff = round(g["currentWeightLbs"] - g["targetWeightLbs"], 1)
        direction = "above" if diff > 0 else "below"
        weight_note = f"\nCurrent weight: {g['currentWeightLbs']}lbs ({abs(diff)}lbs {direction} goal of {g['targetWeightLbs']}lbs)."

    activity_note = ""
    if active_cal > 400 or steps > 10000:
        activity_note = f"High-activity day ({steps:,} steps, {active_cal} active kcal) — prioritize carbs for recovery and protein for muscle repair."

    ingredients_str = ", ".join(req.ingredients) if req.ingredients else "any common ingredients"

    prompt = f"""You are a practical nutrition coach. Suggest exactly 3 meal ideas using the available ingredients.

Available ingredients: {ingredients_str}
(Assume basic pantry staples like oil, salt, pepper, spices, water are available.)

Today's nutrition status:
- Eaten: {eaten_cal:.0f} kcal | {eaten_protein:.0f}g protein | {eaten_carbs:.0f}g carbs | {eaten_fat:.0f}g fat
- Remaining budget: {remaining_cal:.0f} kcal | {remaining_protein:.0f}g protein needed
- Adjusted daily target: {adj_cal} kcal | {adj_protein}g protein | {adj_carbs}g carbs
{activity_note}{weight_note}

For each of the 3 meals provide:
1. Meal name
2. One-sentence prep note
3. Estimated macros: ~X kcal | Pg protein | Cg carbs | Fg fat

Prioritize protein if deficit is high. Include complex carbs if high-activity day."""

    try:
        text = await call_gemini(prompt)
        return {"text": text, "model": GEMINI_MODEL}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI error: {e}")

class OptimizeRequest(BaseModel):
    today: dict = {}
    avg7: dict = {}
    goals: dict = {}
    recovery_score: int = 50
    targets: dict = {}
    workout_recommendation: str = "moderate"

@app.post("/optimize")
async def optimize_day(req: OptimizeRequest):
    t = req.today
    g = req.goals
    avg = req.avg7
    targets = req.targets
    rec = req.recovery_score

    goal_label = g.get("primaryGoal", "general health")
    race_note = ""
    if "race" in goal_label and g.get("targetRacePaceMinPerKm"):
        race_note = f"\nRace goal: {g.get('raceDistanceKm','?')}km at {g.get('targetRacePaceMinPerKm','?')} min/km."
        if g.get("targetRaceDate"):
            race_note += f" Race date: {g['targetRaceDate']}."

    weight_note = ""
    if g.get("currentWeightLbs") and g.get("targetWeightLbs"):
        diff = round(float(g["currentWeightLbs"]) - float(g["targetWeightLbs"]), 1)
        direction = "above" if diff > 0 else "below"
        weight_note = f"\nWeight: {g['currentWeightLbs']}lbs ({abs(diff)}lbs {direction} goal of {g['targetWeightLbs']}lbs)."

    prompt = f"""You are an elite personal health coach giving someone their morning optimization brief. Be direct, specific, and encouraging. 2-3 short paragraphs max.

Today's biometrics:
- Recovery score: {rec}/100 ({req.workout_recommendation} training day)
- Body battery: {t.get('bodyBattery','?')}/100
- Last night's sleep: {t.get('sleepHours','?')}h (score: {t.get('sleepScore','?')}, HRV: {t.get('hrv','?')}ms)
- Resting HR: {t.get('restingHR','?')}bpm (7-day avg: {avg.get('restingHeartRate','?')}bpm)
- Steps so far: {t.get('steps','?')}

7-day averages: sleep {avg.get('sleepHours','?')}h, HRV {avg.get('hrv','?')}ms, stress {avg.get('avgStress','?')}/100

Today's optimized targets:
- Calories: {targets.get('calorieTarget','?')} kcal
- Protein: {targets.get('proteinTarget','?')}g | Carbs: {targets.get('carbTarget','?')}g | Fat: {targets.get('fatTarget','?')}g
- Steps: {targets.get('stepTarget','?')} | Water: {targets.get('waterTarget','?')} cups

Primary goal: {goal_label}{race_note}{weight_note}

Give them a personalized morning brief: what their body is telling them today, why today's targets are set the way they are, and one specific focus for the day."""

    try:
        text = await call_gemini(prompt)
        return {"text": text, "model": GEMINI_MODEL}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI error: {e}")


class DeepInsightRequest(BaseModel):
    snapshots: list[dict]
    goals: dict = {}
    food_logs: list[dict] = []

@app.post("/deep-insights")
async def deep_insights(req: DeepInsightRequest):
    snaps = req.snapshots
    g = req.goals
    food = req.food_logs

    if len(snaps) < 7:
        raise HTTPException(status_code=400, detail="Need at least 7 days of data for deep insights")

    # Build rich data summary
    lines = []
    for s in snaps[:60]:  # cap at 60 days
        parts = [f"{s.get('date','?')}"]
        if s.get("steps"):             parts.append(f"steps:{s['steps']:,}")
        if s.get("bodyBattery"):       parts.append(f"BB:{s['bodyBattery']}")
        if s.get("sleepHours"):        parts.append(f"sleep:{s['sleepHours']:.1f}h/score:{s.get('sleepScore','?')}")
        if s.get("hrv"):               parts.append(f"HRV:{s['hrv']}ms")
        if s.get("restingHeartRate"):  parts.append(f"RHR:{s['restingHeartRate']}")
        if s.get("avgStress"):         parts.append(f"stress:{s['avgStress']}")
        if s.get("weightKg"):          parts.append(f"wt:{round(s['weightKg']*2.2046,1)}lbs")
        if s.get("bodyFatPct"):        parts.append(f"bf:{s['bodyFatPct']}%")
        if s.get("caloriesConsumed"):  parts.append(f"kcal:{s['caloriesConsumed']}")
        if s.get("proteinG"):          parts.append(f"P:{s.get('proteinG')}g")
        if s.get("activeCalories"):    parts.append(f"burn:{s['activeCalories']}")
        lines.append(" | ".join(parts))

    goal_label = g.get("primaryGoal", "general health")
    race_note = ""
    if g.get("targetRacePaceMinPerKm"):
        race_note = f"\nRace goal: {g.get('raceDistanceKm','?')}km at {g.get('targetRacePaceMinPerKm','?')} min/km."

    prompt = f"""You are a world-class sports scientist and nutritionist with access to {len(snaps)} days of comprehensive biometric data. Your job is to find meaningful patterns, correlations, and insights that this person cannot see themselves.

HEALTH DATA ({len(snaps)} days):
{chr(10).join(lines)}

User goals: {goal_label}{race_note}
Current weight: {g.get('currentWeightLbs','?')}lbs → target: {g.get('targetWeightLbs','?')}lbs

Analyze this data deeply. Look for:
1. Correlations between sleep quality and next-day performance metrics
2. Nutrition patterns affecting recovery (HRV, body battery trends)
3. Stress and sleep relationships
4. Weight trend and what's actually driving it (calories, activity, both?)
5. HRV trends — are they improving, declining, or seasonal?
6. Best and worst performing weeks — what was different?
7. Any warning signs (chronically elevated RHR, declining HRV, poor sleep trend)
8. Specific, data-backed recommendations with actual numbers

Respond in this EXACT format:
HEADLINE: [one powerful sentence summarizing the most important finding]

FINDINGS:
- [specific finding with actual numbers from their data]
- [specific finding with actual numbers]
- [specific finding with actual numbers]
- [specific finding with actual numbers]
- [specific finding with actual numbers]

PATTERNS:
- [correlation discovered, e.g. "Your HRV drops 18% the day after eating >2,800 calories"]
- [another pattern]
- [another pattern]

ACTIONS:
- [specific, concrete action with target numbers]
- [specific action]
- [specific action]
- [specific action]"""

    try:
        text = await call_gemini(prompt, max_tokens=2048)
        # Parse structured response
        findings, patterns, actions = [], [], []
        headline = ""
        section = None
        for line in text.split('\n'):
            line = line.strip()
            if line.startswith('HEADLINE:'):
                headline = line.replace('HEADLINE:', '').strip()
            elif line.startswith('FINDINGS:'):
                section = 'findings'
            elif line.startswith('PATTERNS:'):
                section = 'patterns'
            elif line.startswith('ACTIONS:'):
                section = 'actions'
            elif line.startswith('- ') and section:
                item = line[2:].strip()
                if section == 'findings': findings.append(item)
                elif section == 'patterns': patterns.append(item)
                elif section == 'actions': actions.append(item)

        return {
            "generated_at": __import__('datetime').datetime.utcnow().isoformat(),
            "headline": headline or "Deep analysis complete",
            "findings": findings,
            "patterns": patterns,
            "actions": actions,
            "raw": text,
            "model": GEMINI_MODEL,
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI error: {e}")


@app.get("/health")
def health():
    return {"status": "ok", "garmin_connected": client is not None, "ai": "gemini" if GEMINI_API_KEY else "not configured"}


# ── Conversational AI chat ────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str    # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    context: dict = {}   # snapshots[], goals{}, brief{}

CHAT_SYSTEM_PROMPT = """You are a personal AI health coach with deep expertise in sports science, nutrition, and recovery optimization. You have full access to the user's real health data (Garmin, Apple Health, food logs, body composition) and you know their goals.

Your personality: direct, evidence-based, warm but not fluffy. You reference actual numbers from their data. You explain your reasoning clearly when asked. You don't give generic advice — everything you say is grounded in their specific metrics.

When the user asks you to take an action (update a goal, set a target, change a setting), respond with a clear confirmation AND append an ACTION block at the very end of your message in this exact format:
ACTION_JSON: {"type": "update_goal", "field": "<fieldName>", "value": <value>}

Supported action types and fields:
- update_goal: dailySteps, dailyCalories, proteinG, carbsG, fatG, sleepHours, waterCups, fiberG, weeklyWorkouts, primaryGoal, currentWeightLbs, targetWeightLbs

Only append ACTION_JSON when the user explicitly asks you to change or set something. For questions and explanations, just answer."""

def format_chat_context(ctx: dict) -> str:
    lines = ["=== YOUR HEALTH DATA ==="]

    snaps = ctx.get("snapshots", [])
    if snaps:
        lines.append(f"\nLast {len(snaps)} days of biometrics:")
        for s in snaps[:14]:
            parts = [s.get("date", "?")]
            if s.get("steps"):            parts.append(f"steps:{s['steps']:,}")
            if s.get("bodyBattery"):      parts.append(f"BB:{s['bodyBattery']}")
            if s.get("sleepHours"):       parts.append(f"sleep:{s['sleepHours']:.1f}h")
            if s.get("sleepScore"):       parts.append(f"sleep_score:{s['sleepScore']}")
            if s.get("hrv"):              parts.append(f"HRV:{s['hrv']}ms")
            if s.get("restingHeartRate"): parts.append(f"RHR:{s['restingHeartRate']}")
            if s.get("avgStress"):        parts.append(f"stress:{s['avgStress']}")
            if s.get("activeCalories"):   parts.append(f"burn:{s['activeCalories']}")
            if s.get("caloriesConsumed"): parts.append(f"ate:{s['caloriesConsumed']}kcal")
            if s.get("proteinG"):         parts.append(f"P:{s['proteinG']}g")
            if s.get("weightKg"):         parts.append(f"wt:{round(s['weightKg']*2.2046,1)}lbs")
            if s.get("bodyFatPct"):       parts.append(f"bf:{s['bodyFatPct']}%")
            lines.append("  " + " | ".join(parts))

    g = ctx.get("goals", {})
    if g:
        lines.append("\n=== GOALS ===")
        lines.append(f"Primary goal: {g.get('primaryGoal','general_health')}")
        lines.append(f"Daily calories: {g.get('dailyCalories','?')} kcal")
        lines.append(f"Protein: {g.get('proteinG','?')}g | Carbs: {g.get('carbsG','?')}g | Fat: {g.get('fatG','?')}g")
        lines.append(f"Steps: {g.get('dailySteps','?')} | Sleep: {g.get('sleepHours','?')}h | Water: {g.get('waterCups','?')} cups")
        if g.get("currentWeightLbs"): lines.append(f"Weight: {g['currentWeightLbs']}lbs → target: {g.get('targetWeightLbs','?')}lbs")
        if g.get("targetRacePaceMinPerKm"): lines.append(f"Race: {g.get('raceDistanceKm','?')}km at {g['targetRacePaceMinPerKm']} min/km by {g.get('targetRaceDate','?')}")

    brief = ctx.get("brief", {})
    if brief:
        lines.append("\n=== TODAY'S BRIEF ===")
        lines.append(f"Recovery score: {brief.get('recoveryScore','?')}/100 ({brief.get('recoveryLabel','?')})")
        lines.append(f"Today's targets: {brief.get('calorieTarget','?')} kcal, {brief.get('proteinTarget','?')}g protein, {brief.get('stepTarget','?')} steps")
        lines.append(f"Workout recommendation: {brief.get('workoutRecommendation','?')} — {brief.get('workoutReason','')}")
        if brief.get("aiText"): lines.append(f"AI note: {brief['aiText']}")

    return "\n".join(lines)


@app.post("/chat")
async def chat(req: ChatRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not configured")
    if not req.messages:
        raise HTTPException(status_code=400, detail="No messages provided")

    context_str = format_chat_context(req.context)

    # Build Gemini history (all but the last user message)
    history = []
    for msg in req.messages[:-1]:
        role = "model" if msg.role == "assistant" else "user"
        history.append({"role": role, "parts": [msg.content]})

    last_message = req.messages[-1].content

    try:
        model = genai.GenerativeModel(
            GEMINI_MODEL,
            system_instruction=f"{CHAT_SYSTEM_PROMPT}\n\n{context_str}",
            generation_config=genai.GenerationConfig(
                max_output_tokens=1024,
                temperature=0.7,
            ),
        )

        chat_session = model.start_chat(history=history)

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, chat_session.send_message, last_message)
        text = response.text

        # Parse optional action from response
        action = None
        action_marker = "ACTION_JSON:"
        if action_marker in text:
            try:
                action_str = text.split(action_marker, 1)[1].strip()
                # Extract just the JSON object
                import json, re
                match = re.search(r'\{.*?\}', action_str, re.DOTALL)
                if match:
                    action = json.loads(match.group())
                    # Strip the action line from the displayed text
                    text = text.split(action_marker, 1)[0].strip()
            except Exception:
                pass

        return {"reply": text, "action": action, "model": GEMINI_MODEL}

    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI error: {e}")

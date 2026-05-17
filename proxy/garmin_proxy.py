import os
import json
import urllib.request
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from garminconnect import Garmin, GarminConnectAuthenticationError
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Garmin Proxy")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

try:
    client = Garmin(os.environ["GARMIN_EMAIL"], os.environ["GARMIN_PASSWORD"])
    client.login()
    print("Garmin login successful")
except GarminConnectAuthenticationError as e:
    print(f"Garmin login failed: {e}")
    client = None

def require_client():
    if client is None:
        raise HTTPException(status_code=503, detail="Garmin client not authenticated")
    return client

@app.get("/garmin/snapshot/{date_str}")
def get_snapshot(date_str: str):
    c = require_client()
    result = {"date": date_str}
    try: result["steps"] = c.get_steps_data(date_str)
    except Exception: result["steps"] = None
    try: result["sleep"] = c.get_sleep_data(date_str)
    except Exception: result["sleep"] = None
    try: result["hrv"] = c.get_hrv_data(date_str)
    except Exception: result["hrv"] = None
    try: result["body_battery"] = c.get_body_battery(date_str)
    except Exception: result["body_battery"] = None
    try: result["heart_rate"] = c.get_heart_rates(date_str)
    except Exception: result["heart_rate"] = None
    try: result["stress"] = c.get_stress_data(date_str)
    except Exception: result["stress"] = None
    try: result["respiration"] = c.get_respiration_data(date_str)
    except Exception: result["respiration"] = None
    return result

@app.get("/garmin/activities")
def get_activities(limit: int = 10):
    return require_client().get_activities(0, limit)

@app.get("/garmin/body-battery/{date_str}")
def get_body_battery(date_str: str):
    return require_client().get_body_battery(date_str)

@app.get("/garmin/sleep/{date_str}")
def get_sleep(date_str: str):
    return require_client().get_sleep_data(date_str)

@app.get("/garmin/hrv/{date_str}")
def get_hrv(date_str: str):
    return require_client().get_hrv_data(date_str)

@app.get("/garmin/stress/{date_str}")
def get_stress(date_str: str):
    return require_client().get_stress_data(date_str)

class InsightRequest(BaseModel):
    snapshots: list[dict]
    model: str = "llama3.1:8b"

SYSTEM_PROMPT = """You are a personal health coach reviewing one week of data from someone's Garmin watch, Withings scale, and MyFitnessPal food log. Identify patterns, flag concerns, and give 3-5 specific, actionable recommendations. Reference actual numbers. Be concise, speak directly to the user as "you". No bullet points or headers — short paragraphs only."""

@app.post("/insights")
def generate_insights(req: InsightRequest):
    lines = []
    for s in req.snapshots:
        parts = [f"Date: {s.get('date', '?')}"]
        if s.get("steps") is not None: parts.append(f"Steps: {s['steps']:,}")
        if s.get("bodyBattery") is not None: parts.append(f"Body Battery: {s['bodyBattery']}/100")
        if s.get("sleepHours") is not None:
            parts.append(f"Sleep: {s['sleepHours']:.1f}h (score {s.get('sleepScore','?')}, deep {s.get('deepSleepHours','?')}h, REM {s.get('remSleepHours','?')}h)")
        if s.get("hrv") is not None: parts.append(f"HRV: {s['hrv']}ms")
        if s.get("restingHeartRate") is not None: parts.append(f"RHR: {s['restingHeartRate']}bpm")
        if s.get("spo2") is not None: parts.append(f"SpO2: {s['spo2']:.1f}%")
        if s.get("avgStress") is not None: parts.append(f"Stress: {s['avgStress']}/100")
        if s.get("weightKg") is not None:
            parts.append(f"Weight: {s['weightKg']:.1f}kg | Fat: {s.get('bodyFatPct','?')}% | Muscle: {s.get('muscleMassKg','?')}kg")
        if s.get("caloriesConsumed") is not None:
            parts.append(f"Nutrition: {s['caloriesConsumed']}kcal | P:{s.get('proteinG','?')}g C:{s.get('carbsG','?')}g F:{s.get('fatG','?')}g")
        lines.append(" | ".join(parts))

    prompt = f"{SYSTEM_PROMPT}\n\nHere is my health data for the past week:\n\n" + "\n".join(lines) + "\n\nPlease give me your analysis and recommendations."

    payload = json.dumps({"model": req.model, "prompt": prompt, "stream": False}).encode()
    try:
        with urllib.request.urlopen(
            urllib.request.Request("http://localhost:11434/api/generate", data=payload, headers={"Content-Type": "application/json"}),
            timeout=120,
        ) as resp:
            result = json.loads(resp.read())
            return {"text": result.get("response", ""), "model": req.model}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Ollama error: {e}")

@app.get("/health")
def health():
    return {"status": "ok", "garmin_connected": client is not None}

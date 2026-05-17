import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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

@app.get("/health")
def health():
    return {"status": "ok", "garmin_connected": client is not None}

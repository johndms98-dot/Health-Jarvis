import os
import myfitnesspal
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="MyFitnessPal Proxy")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

try:
    client = myfitnesspal.Client(os.environ["MFP_USERNAME"], password=os.environ["MFP_PASSWORD"])
    print("MFP client ready")
except Exception as e:
    print(f"MFP client init failed: {e}")
    client = None

def require_client():
    if client is None:
        raise HTTPException(status_code=503, detail="MFP client not initialized")
    return client

@app.get("/nutrition/{date_str}")
def get_nutrition(date_str: str):
    c = require_client()
    try:
        day = c.get_date(date_str)
        return {
            "date": date_str,
            "totals": day.totals,
            "meals": [{"name": m.name, "totals": m.totals, "entries": [{"name": e.name, "totals": e.totals} for e in m.entries]} for m in day.meals],
            "water": day.water,
            "notes": day.notes,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/nutrition/week/{start_date}")
def get_week(start_date: str):
    from datetime import date, timedelta
    c = require_client()
    results = []
    d = date.fromisoformat(start_date)
    for i in range(7):
        date_str = (d + timedelta(days=i)).isoformat()
        try:
            day = c.get_date(date_str)
            results.append({"date": date_str, "totals": day.totals, "water": day.water})
        except Exception:
            results.append({"date": date_str, "error": "no data"})
    return results

@app.get("/health")
def health():
    return {"status": "ok", "mfp_connected": client is not None}

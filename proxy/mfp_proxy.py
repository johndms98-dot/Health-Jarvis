"""
MyFitnessPal proxy — uses MFP's internal API directly with Chrome browser cookies.
No dependency on the myfitnesspal Python library.
"""
import browser_cookie3
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="MyFitnessPal Proxy")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
MFP_API = "https://api.myfitnesspal.com/v2"

def get_session():
    """Build an authenticated MFP session using Chrome cookies."""
    cookies = browser_cookie3.chrome(domain_name='myfitnesspal.com')
    s = requests.Session()
    s.cookies.update(cookies)
    s.headers.update({"User-Agent": MAC_UA})

    r = s.get("https://www.myfitnesspal.com/user/auth_token?refresh=true", timeout=10)
    if not r.ok or "application/json" not in r.headers.get("Content-Type", ""):
        raise Exception("Not logged into MFP in Chrome, or session expired.")

    data = r.json()
    token = data["access_token"]
    user_id = str(data["user_id"])

    s.headers.update({
        "Authorization": f"Bearer {token}",
        "mfp-client-id": "mfp-main-js",
        "mfp-user-id": user_id,
        "Accept": "application/json",
    })
    return s

def sum_nutrients(items: list) -> dict:
    totals: dict = {}
    for item in items:
        nc = item.get("nutritional_contents", {})
        for k, v in nc.items():
            if k == "energy":
                totals["calories"] = totals.get("calories", 0) + (v.get("value", 0) if isinstance(v, dict) else 0)
            elif isinstance(v, (int, float)):
                totals[k] = totals.get(k, 0) + v
    return {k: round(v, 1) for k, v in totals.items()}

@app.get("/nutrition/{date_str}")
def get_nutrition(date_str: str):
    try:
        s = get_session()
        r = s.get(f"{MFP_API}/diary?date={date_str}&fields[]=nutritional_contents", timeout=10)
        if not r.ok:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        items = r.json().get("items", [])

        # Group by meal
        meals: dict = {}
        for item in items:
            meal = item.get("diary_meal", "Other")
            meals.setdefault(meal, []).append(item)

        return {
            "date": date_str,
            "totals": sum_nutrients(items),
            "meals": [
                {"name": meal, "totals": sum_nutrients(entries)}
                for meal, entries in meals.items()
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.get("/health")
def health():
    try:
        get_session()
        return {"status": "ok", "mfp_connected": True}
    except Exception as e:
        return {"status": "ok", "mfp_connected": False, "hint": str(e)}

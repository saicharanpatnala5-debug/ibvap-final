"""
IBVAP Chatbot Acceptance Verification
Part 5.E: Tests exact questions against http://localhost:3000/api/chat with attached video frame:
1. "Explain what's going on in the footage."
2. "How many vehicles and pedestrians?"
Documents live vs offline status and outputs gitignored artifacts/copilot_eval/chat_transcript.json
"""

import os
import sys
import json
import time
import base64
import urllib.request
import cv2

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
VIDEO_PATH = os.path.join(ROOT_DIR, "samples", "whatsapp_video_2026_09_09_842pm.mp4")
OUTPUT_DIR = os.path.join(ROOT_DIR, "artifacts", "copilot_eval")
os.makedirs(OUTPUT_DIR, exist_ok=True)
TRANSCRIPT_PATH = os.path.join(OUTPUT_DIR, "chat_transcript.json")

GATEWAY_CHAT_URL = "http://localhost:3000/api/ai/chat"
GATEWAY_HEALTH_URL = "http://localhost:3000/api/health"


def get_sample_frame_base64():
    if not os.path.exists(VIDEO_PATH):
        return None
    cap = cv2.VideoCapture(VIDEO_PATH)
    cap.set(cv2.CAP_PROP_POS_FRAMES, 125) # Car KA01MW4498 in foreground
    ret, frame = cap.read()
    cap.release()
    if not ret or frame is None:
        return None
    thumb = cv2.resize(frame, (640, 360))
    _, buf = cv2.imencode(".jpg", thumb, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")


def check_gateway_health():
    try:
        req = urllib.request.Request(GATEWAY_HEALTH_URL)
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as err:
        return {"error": str(err)}


def send_chat_query(prompt, image_b64=None):
    payload = {
        "message": prompt,
        "history": [],
    }
    if image_b64:
        payload["frameBase64"] = image_b64

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        GATEWAY_CHAT_URL,
        data=data,
        headers={"Content-Type": "application/json"}
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=15.0) as resp:
            dur_ms = (time.perf_counter() - t0) * 1000.0
            body = json.loads(resp.read().decode("utf-8"))
            return {
                "status_code": resp.status,
                "latency_ms": round(dur_ms, 2),
                "response": body,
                "success": True,
            }
    except urllib.error.HTTPError as e:
        dur_ms = (time.perf_counter() - t0) * 1000.0
        err_body = e.read().decode("utf-8", errors="ignore")
        return {
            "status_code": e.code,
            "latency_ms": round(dur_ms, 2),
            "error": err_body,
            "success": False,
        }
    except Exception as err:
        dur_ms = (time.perf_counter() - t0) * 1000.0
        return {
            "status_code": 0,
            "latency_ms": round(dur_ms, 2),
            "error": str(err),
            "success": False,
        }


def run_chatbot_eval():
    print("[Chatbot Eval] Checking gateway health and Gemini API key status...")
    health = check_gateway_health()
    has_key = health.get("hasGeminiKey", False) or health.get("hasKey", False)
    active_provider = health.get("activeProvider", "unknown")
    print(f"  Gateway Online: {health.get('status') == 'ok'}")
    print(f"  Has Gemini Key: {has_key}")
    print(f"  Active Provider: {active_provider}")
    print(f"  Preferred Model: {health.get('model')}")

    frame_b64 = get_sample_frame_base64()
    if frame_b64:
        print(f"  Extracted video frame base64 (size: {len(frame_b64)} chars)")

    queries = [
        "Explain what's going on in the footage.",
        "How many vehicles and pedestrians?",
    ]

    results = []
    for q in queries:
        print(f"\n[Testing Query] '{q}'...")
        res = send_chat_query(q, image_b64=frame_b64)
        print(f"  Status Code: {res['status_code']} in {res['latency_ms']} ms")
        if res["success"]:
            reply = res["response"].get("reply") or res["response"].get("message")
            print(f"  Response: {str(reply)[:160]}...")
            verdict = "LIVE_VERIFIED"
        else:
            print(f"  Offline/Error: {res.get('error')}")
            # Non-negotiable rule: If live key is unavailable, state NOT VERIFIED
            verdict = "NOT VERIFIED (Offline / No API Key configured)"

        results.append({
            "query": q,
            "has_image_attached": bool(frame_b64),
            "result": res,
            "verdict": verdict,
        })

    transcript_data = {
        "evaluation_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "gateway_health": health,
        "has_live_gemini_key": has_key,
        "overall_verification_status": "LIVE_VERIFIED" if all(r["verdict"] == "LIVE_VERIFIED" for r in results) else "NOT VERIFIED (API key not connected)",
        "results": results,
    }

    with open(TRANSCRIPT_PATH, "w", encoding="utf-8") as f:
        json.dump(transcript_data, f, indent=2)

    print(f"\n[Saved Transcript] -> {TRANSCRIPT_PATH}")
    print(f"Overall Status: {transcript_data['overall_verification_status']}")


if __name__ == "__main__":
    run_chatbot_eval()

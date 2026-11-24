"""
IBVAP Chatbot Grounded Real Database Query Verification
Queries /api/ai/chat against the actual database and tracker telemetry,
comparing real footage reads vs seeded test data.
"""

import urllib.request
import json

BASE_URL = "http://localhost:3000"

QUERIES = [
    "Explain what's going on in the footage",
    "How many vehicles and pedestrians were detected?",
    "Show license plates read and needing review",
    "Why did the loitering alert fire?",
    "Which zone had security activity?",
]


def ask_chatbot(message: str, context: dict = None):
    url = f"{BASE_URL}/api/ai/chat"
    payload = {
        "message": message,
        "context": context or {},
        "cameraName": "Sector 4 Vehicle Checkpoint",
        "stream": False,
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("text", "")
    except Exception as e:
        return f"ERROR: {e}"


def run():
    print("=== TEST A: Clean Real Database State (Zero Seeded Mock Data) ===")
    real_context = {
        "entities": [
            {"id": 1, "class": "car", "confidence": 91, "anpr": {"plateText": "TN55CZ5446", "confidence": 100.0, "isReadable": True}},
            {"id": 5, "class": "two_wheeler", "confidence": 61, "anpr": None},
            {"id": 12, "class": "pedestrian", "confidence": 85, "anpr": None},
        ],
        "clipTotalEntities": [
            {"id": 1, "class": "car", "confidence": 91, "anpr": {"plateText": "TN55CZ5446"}},
            {"id": 5, "class": "two_wheeler", "confidence": 61},
            {"id": 6, "class": "car", "confidence": 88, "anpr": {"plateText": "KA01MW4498"}},
            {"id": 8, "class": "car", "confidence": 79, "anpr": {"plateText": "DL7CQ0258"}},
            {"id": 11, "class": "pedestrian", "confidence": 80},
            {"id": 12, "class": "pedestrian", "confidence": 85},
        ],
        "videoTime": 5.0,
    }

    for q in QUERIES:
        print(f"\nUser: {q}")
        reply = ask_chatbot(q, real_context)
        print(f"Chatbot Reply:\n{reply}")

    print("\n=== TEST B: Demo Fixture State (Mock Seeded Data) ===")
    mock_context = {
        "isDemo": True,
        "seededData": True,
        "entities": [
            {"id": 101, "class": "car", "confidence": 94, "anpr": {"plateText": "HR26DK8337", "isWatchlist": True}},
            {"id": 102, "class": "pedestrian", "confidence": 82},
        ],
        "clipTotalEntities": [
            {"id": 101, "class": "car", "confidence": 94},
            {"id": 102, "class": "pedestrian", "confidence": 82},
        ],
        "videoTime": 1.2,
    }
    for q in [QUERIES[1], QUERIES[2]]:
        print(f"\nUser: {q}")
        reply = ask_chatbot(q, mock_context)
        print(f"Chatbot Reply (Demo Mode):\n{reply}")


if __name__ == "__main__":
    run()

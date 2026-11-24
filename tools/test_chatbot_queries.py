"""
Test and record actual chatbot replies from /api/ai/chat
"""
import urllib.request
import json
import time

URL = "http://localhost:3000/api/ai/chat"

def ask_bot(prompt):
    payload = json.dumps({"message": prompt}).encode("utf-8")
    req = urllib.request.Request(
        URL,
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data
    except Exception as e:
        return {"error": str(e)}

def main():
    print("=== Testing Copilot Chatbot Endpoints ===")
    
    q1 = "Explain what's going on in the footage"
    print(f"\n[Query 1]: {q1}")
    res1 = ask_bot(q1)
    text1 = res1.get("text", res1.get("error", "No text"))
    source1 = res1.get("source", "unknown")
    print(f"[Source]: {source1}")
    print(f"[Answer]:\n{text1}\n")

    q2 = "How many vehicles and pedestrians were detected?"
    print(f"\n[Query 2]: {q2}")
    res2 = ask_bot(q2)
    text2 = res2.get("text", res2.get("error", "No text"))
    source2 = res2.get("source", "unknown")
    print(f"[Source]: {source2}")
    print(f"[Answer]:\n{text2}\n")

if __name__ == "__main__":
    main()

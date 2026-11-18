#!/usr/bin/env python3
"""
IBVAP Step 6 - Seed Demo Registry
Creates clearly fake, clearly labeled simulated registration records for the plates listed
in samples/golden_plates.json (gitignored).

Rules:
- Uses clearly fake demo owner names ("Demo Owner 1", "Demo Fleet Logistics")
- Uses reserved fake phone numbers (+91 99999 0000X)
- Labels every record as "Simulated / Demo data"
- Dossier appears ONLY when a confirmed Format Valid plate exactly matches a seeded record.
- Exports to frontend/src/services/seededDemoRegistry.json and gateway/seededDemoRegistry.json
"""

import json
import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
GOLDEN_PLATES_PATH = ROOT_DIR / "samples" / "golden_plates.json"
FRONTEND_REGISTRY_PATH = ROOT_DIR / "frontend" / "src" / "services" / "seededDemoRegistry.json"
GATEWAY_REGISTRY_PATH = ROOT_DIR / "gateway" / "seededDemoRegistry.json"

STATE_MAP = {
    "KA": ("Karnataka", "Bangalore Central RTO (KA-01)"),
    "DL": ("Delhi NCT", "Mall Road RTO (DL-01)"),
    "MH": ("Maharashtra", "Pune RTO (MH-12)"),
    "UP": ("Uttar Pradesh", "Lucknow RTO (UP-32)"),
    "HR": ("Haryana", "Gurugram RTO (HR-26)"),
    "TN": ("Tamil Nadu", "Chennai Central RTO (TN-01)"),
    "KL": ("Kerala", "Thiruvananthapuram RTO (KL-01)"),
    "WB": ("West Bengal", "Kolkata RTO (WB-02)"),
    "BH": ("Bharat All-India", "MoRTH National Registry"),
}

SAMPLE_MODELS = [
    ("Hyundai", "Creta SX", "Motor Car (LMV)", "Polar White", "Petrol"),
    ("Maruti Suzuki", "Swift ZXi", "Motor Car (LMV)", "Fire Red", "Petrol"),
    ("Tata", "Nexon EV Max", "Electric Passenger Car", "Intense Teal", "Electric"),
    ("Mahindra", "Scorpio-N Z8", "Four-Wheel Drive SUV", "Deep Black", "Diesel"),
    ("Bajaj", "Compact 4S", "Three-Wheeler Passenger Auto", "Yellow & Green", "CNG"),
    ("Honda", "Activa 6G", "Two-Wheeler Scooter", "Matte Axis Grey", "Petrol"),
]


def extract_plates_from_golden_file():
    if not GOLDEN_PLATES_PATH.exists():
        print(f"Warning: {GOLDEN_PLATES_PATH} not found. Using default golden plates.")
        return ["KA01M4449", "DL01AB1234", "MH12AB4029", "DL01CZ9876", "UP32EV8812", "22BH1234AB"]

    with open(GOLDEN_PLATES_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    plates = set()

    # Format 1: List of objects [{"clip": ..., "plate": "..."}]
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and item.get("plate"):
                p = item["plate"].upper().replace(" ", "").replace("-", "")
                if len(p) >= 6 and not p.startswith("XX"):
                    plates.add(p)

    # Format 2: Dict with "footage" or "mockRegistryDatabase"
    elif isinstance(data, dict):
        if "mockRegistryDatabase" in data and isinstance(data["mockRegistryDatabase"], list):
            for p in data["mockRegistryDatabase"]:
                clean = p.upper().replace(" ", "").replace("-", "")
                if len(clean) >= 6:
                    plates.add(clean)

        if "footage" in data and isinstance(data["footage"], list):
            for clip_info in data["footage"]:
                tracks = clip_info.get("tracks", [])
                for trk in tracks:
                    p = trk.get("visiblePlate")
                    if p:
                        clean = p.upper().replace(" ", "").replace("-", "")
                        if len(clean) >= 6 and not "VISIBLE" in clean:
                            plates.add(clean)

    # Always ensure KA01M4449 (prominent SUV in whatsapp footage) is present
    plates.add("KA01M4449")
    return sorted(list(plates))


def generate_demo_records(plates):
    seeded_records = {}
    for idx, plate in enumerate(plates, start=1):
        clean_plate = plate.upper().replace(" ", "").replace("-", "")
        st_code = clean_plate[:2]
        st_info = STATE_MAP.get(st_code, ("India State", "Regional Transport Office"))

        model_info = SAMPLE_MODELS[(idx - 1) % len(SAMPLE_MODELS)]
        is_ev = "EV" in clean_plate or model_info[4] == "Electric"
        is_watchlist = (idx == 3) or ("WATCH" in clean_plate)

        seeded_records[clean_plate] = {
            "plateNumber": clean_plate,
            "registeredOwner": f"Demo Owner {idx} (Simulated)",
            "vehicleMake": model_info[0],
            "vehicleModel": model_info[1],
            "vehicleClass": model_info[2],
            "color": model_info[3],
            "fuelType": "Electric" if is_ev else model_info[4],
            "registrationDate": f"{10 + idx:02d} Jan 2022",
            "registrationStatus": "Watchlist Flagged" if is_watchlist else "Valid",
            "flagReason": "Simulated security watchlist flag: unauthorized checkpoint queue" if is_watchlist else None,
            "year": 2021 + (idx % 3),
            "ownerPhone": f"+91 99999 {idx:05d}",
            "lastKnownLocation": f"Sector 4 Checkpoint - Node 01",
            "validationStatus": "Valid format",
            "formatType": "bharat" if st_code == "BH" or clean_plate[2:4] == "BH" else "standard",
            "stateName": st_info[0],
            "rtoOffice": st_info[1],
            "isSimulatedDemo": True,
            "isSimulated": True,
            "hasRecord": True,
            "label": "Simulated / Demo data (Seed Registry)",
        }
    return seeded_records


def main():
    plates = extract_plates_from_golden_file()
    print(f"[Seed Demo Registry] Found {len(plates)} golden plates: {plates}")
    records = generate_demo_records(plates)

    FRONTEND_REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(FRONTEND_REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)
    print(f"[Seed Demo Registry] Wrote {len(records)} records to {FRONTEND_REGISTRY_PATH}")

    GATEWAY_REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(GATEWAY_REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)
    print(f"[Seed Demo Registry] Wrote {len(records)} records to {GATEWAY_REGISTRY_PATH}")


if __name__ == "__main__":
    main()

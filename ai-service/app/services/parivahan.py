"""
Official MoRTH Parivahan / VAHAN National Vehicle Register Integration.
Compliance Notice:
1. Authorized VAHAN lookup requires official enterprise API access from MoRTH / NIC.
2. Web scraping of the public Parivahan portal is strictly prohibited under the Information
   Technology Act 2000 and Digital Personal Data Protection (DPDP) Act 2023.
3. When official credentials (PARIVAHAN_API_KEY) are not provided, IBVAP clearly discloses
   that registration lookup is unconfigured and displays visual telemetry only.
"""

import os
import urllib.request
import json
from typing import Optional, Dict, Any

PARIVAHAN_API_KEY = os.environ.get("PARIVAHAN_API_KEY", "")
PARIVAHAN_CLIENT_ID = os.environ.get("PARIVAHAN_CLIENT_ID", "")
PARIVAHAN_API_URL = os.environ.get("PARIVAHAN_API_URL", "https://vahan.parivahan.gov.in/api/v1/vehicle-details")

# Curated ground truth demo registry for offline prototype evaluation
# All records are strictly simulated and explicitly labeled as such.
SIMULATED_DEMO_RECORDS: Dict[str, Dict[str, Any]] = {
    "HR12AX8522": {
        "plateNumber": "HR12AX8522",
        "registeredOwner": "Commercial Logistics Fleet",
        "vehicleMake": "Maruti Suzuki",
        "vehicleModel": "Ertiga VXI",
        "vehicleClass": "Multi-Passenger Vehicle (MPV)",
        "color": "Arctic White",
        "fuelType": "CNG / Petrol",
        "registrationDate": "12 Mar 2022",
        "registrationStatus": "Valid",
        "year": 2022,
        "ownerPhone": "+91 98123 00012",
        "stateName": "Haryana",
        "rtoOffice": "Rohtak RTO (HR-12)",
        "isSimulatedDemo": True,
        "hasRecord": True,
    },
    "KA01M4449": {
        "plateNumber": "KA01M4449",
        "registeredOwner": "Test Fleet Partner",
        "vehicleMake": "Hyundai",
        "vehicleModel": "i20 Asta",
        "vehicleClass": "Passenger Hatchback",
        "color": "Polar White",
        "fuelType": "Gasoline",
        "registrationDate": "18 Aug 2020",
        "registrationStatus": "Valid",
        "year": 2020,
        "ownerPhone": "+91 98450 04449",
        "stateName": "Karnataka",
        "rtoOffice": "Koramangala RTO (Bengaluru Central)",
        "isSimulatedDemo": True,
        "hasRecord": True,
    },
    "DL01AB1234": {
        "plateNumber": "DL01AB1234",
        "registeredOwner": "Executive Transport Service",
        "vehicleMake": "Hyundai",
        "vehicleModel": "Creta SX",
        "vehicleClass": "Compact SUV",
        "color": "Titan Grey",
        "fuelType": "Gasoline",
        "registrationDate": "10 Feb 2021",
        "registrationStatus": "Valid",
        "year": 2021,
        "ownerPhone": "+91 99999 00001",
        "stateName": "Delhi NCT",
        "rtoOffice": "Mall Road RTO (North Delhi)",
        "isSimulatedDemo": True,
        "hasRecord": True,
    },
    "MH12AB4029": {
        "plateNumber": "MH12AB4029",
        "registeredOwner": "Interstate Passenger Line",
        "vehicleMake": "Toyota",
        "vehicleModel": "Innova Crysta",
        "vehicleClass": "Multi-Utility Vehicle (MUV)",
        "color": "Silver Metallic",
        "fuelType": "Diesel",
        "registrationDate": "14 May 2021",
        "registrationStatus": "Valid",
        "year": 2022,
        "ownerPhone": "+91 99999 00002",
        "stateName": "Maharashtra",
        "rtoOffice": "Pune RTO (MH-12)",
        "isSimulatedDemo": True,
        "hasRecord": True,
    },
    "UP14BQ208": {
        "plateNumber": "UP14BQ208",
        "registeredOwner": "Regional Cargo Carrier",
        "vehicleMake": "Tata",
        "vehicleModel": "Ace Gold",
        "vehicleClass": "Light Commercial Mini-Truck",
        "color": "Pure White",
        "fuelType": "Diesel",
        "registrationDate": "05 Jun 2021",
        "registrationStatus": "Valid",
        "year": 2021,
        "ownerPhone": "+91 98111 00208",
        "stateName": "Uttar Pradesh",
        "rtoOffice": "Ghaziabad RTO (UP-14)",
        "isSimulatedDemo": True,
        "hasRecord": True,
    },
    "22BH1234AB": {
        "plateNumber": "22BH1234AB",
        "registeredOwner": "National Defence / Govt Transport",
        "vehicleMake": "Volvo",
        "vehicleModel": "FH16 Heavy Hauler",
        "vehicleClass": "Heavy Commercial Transport",
        "color": "Dark Slate Gray",
        "fuelType": "Diesel",
        "registrationDate": "12 Sep 2022",
        "registrationStatus": "Valid",
        "year": 2022,
        "ownerPhone": "+91 99999 00005",
        "stateName": "Bharat (BH) All-India Registry",
        "rtoOffice": "Ministry of Road Transport & Highways (MoRTH)",
        "isSimulatedDemo": True,
        "hasRecord": True,
    },
}


class ParivahanRegistryService:
    """
    Manages vehicle registration verification following statutory privacy guidelines.
    """
    @classmethod
    def lookup_vehicle(cls, plate_number: str) -> Dict[str, Any]:
        clean = plate_number.upper().replace(" ", "").strip()
        
        # 1. If official government API key is configured, perform authorized lookup
        if PARIVAHAN_API_KEY:
            try:
                headers = {
                    "Content-Type": "application/json",
                    "x-api-key": PARIVAHAN_API_KEY,
                    "x-client-id": PARIVAHAN_CLIENT_ID,
                    "User-Agent": "IBVAP-Gov-Gateway/8.0",
                }
                payload = json.dumps({"registrationNumber": clean}).encode("utf-8")
                req = urllib.request.Request(PARIVAHAN_API_URL, data=payload, headers=headers)
                with urllib.request.urlopen(req, timeout=4.0) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    if data.get("status") == "success":
                        dossier = data.get("data", {})
                        return {
                            "status": "official_verified",
                            "plateNumber": clean,
                            "hasOfficialRecord": True,
                            "lookupStatus": "OFFICIAL_PARIVAHAN_VERIFIED",
                            "message": "Verified against official Ministry of Road Transport and Highways (MoRTH) registry.",
                            "authorizedDataSource": "MoRTH Parivahan National Register",
                            "dossier": {
                                "plateNumber": clean,
                                "registeredOwner": dossier.get("ownerName", "Authorized Owner"),
                                "vehicleMake": dossier.get("maker", "Standard"),
                                "vehicleModel": dossier.get("makerModel", "Commercial"),
                                "vehicleClass": dossier.get("vehicleClass", "Transport Vehicle"),
                                "color": dossier.get("color", "Not Disclosed"),
                                "fuelType": dossier.get("fuelType", "Diesel"),
                                "registrationDate": dossier.get("registrationDate", ""),
                                "registrationStatus": dossier.get("status", "Active / Valid"),
                                "year": dossier.get("manufacturingYear", 2022),
                                "ownerPhone": dossier.get("maskedMobile", "XXXXX-XXXXX"),
                                "isSimulatedDemo": False,
                                "hasRecord": True,
                            }
                        }
            except Exception as err:
                print(f"[ParivahanRegistry] Official API lookup error: {err}")

        # 2. Check if plate matches pre-approved offline demo dataset
        if clean in SIMULATED_DEMO_RECORDS:
            demo = SIMULATED_DEMO_RECORDS[clean]
            return {
                "status": "demo_simulated",
                "plateNumber": clean,
                "hasOfficialRecord": False,
                "lookupStatus": "DEMO_SCENARIO_RECORD",
                "message": "Demo simulated dossier loaded for offline evaluation. Not retrieved from live Parivahan database.",
                "authorizedDataSource": "Local Simulated Prototype Dataset",
                "dossier": demo,
            }

        # 3. Official credentials unconfigured & not in demo seed
        return {
            "status": "official_unconfigured",
            "plateNumber": clean,
            "hasOfficialRecord": False,
            "lookupStatus": "OFFICIAL_API_CREDENTIALS_REQUIRED",
            "message": "Official Parivahan/VAHAN API credentials (PARIVAHAN_API_KEY) not configured. Under Indian privacy regulations (IT Act / DPDP Act 2023), automated scraping of government portals is prohibited. Visual plate number was detected from camera footage.",
            "authorizedDataSource": None,
            "dossier": None,
        }

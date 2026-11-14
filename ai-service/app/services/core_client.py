import httpx
from typing import Optional
from app.config import settings
from app.models.schemas import VirtualZone, ZoneEvent


class CoreServiceClient:
    def __init__(self):
        self.base_url = settings.CORE_SERVICE_URL.rstrip("/")
        self.service_token = settings.SERVICE_TOKEN
        self.timeout = 5.0

    async def fetch_camera_zones(self, camera_id: str) -> list[VirtualZone]:
        """
        Retrieves active virtual zones configured for this camera from core-service.
        Degrades gracefully if core-service is unreachable.
        """
        url = f"{self.base_url}/api/cameras/{camera_id}/zones"
        headers = {"X-Service-Token": self.service_token}

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    return [VirtualZone(**item) for item in data]
        except Exception as e:
            print(f"[IBVAP CoreClient Notice] Core-service unreachable at {url}: {e}. Operating with local zones.")

        return []

    async def post_zone_event(self, event: ZoneEvent, camera_id: str):
        """
        Dispatches real-time zone breach or intrusion event to core-service
        for risk scoring, persistence, and operator alerting.
        """
        url = f"{self.base_url}/internal/events"
        headers = {
            "X-Service-Token": self.service_token,
            "Content-Type": "application/json",
        }
        payload = {
            "id": event.id,
            "cameraId": camera_id,
            "zoneId": event.zoneId,
            "zoneName": event.zoneName,
            "eventType": event.eventType,
            "objectId": event.objectId,
            "objectClass": event.objectClass,
            "timestamp": event.timestamp,
            "riskScore": event.riskScore,
            "details": event.details,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                await client.post(url, json=payload, headers=headers)
        except Exception as e:
            # Non-blocking: failure to post must never crash the vision pipeline
            print(f"[IBVAP CoreClient Notice] Unable to push event {event.id} to {url}: {e}")

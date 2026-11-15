import os
from pydantic import BaseModel


class Settings(BaseModel):
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    
    # Model & Tracking configuration
    YOLO_MODEL: str = os.getenv("YOLO_MODEL", "yolo26s.pt")
    FALLBACK_MODEL: str = os.getenv("FALLBACK_MODEL", "yolo11s.pt")
    DEVICE: str = os.getenv("DEVICE", "auto")  # 'auto', 'cpu', 'cuda', 'mps'
    CONF_THRESHOLD: float = float(os.getenv("CONF_THRESHOLD", "0.22"))  # Tuned for high-fidelity border surveillance
    IOU_THRESHOLD: float = float(os.getenv("IOU_THRESHOLD", "0.45"))
    IMGSZ: int = int(os.getenv("IMGSZ", "640"))  # Default 640 for speed and stability
    TRACKER: str = os.getenv("TRACKER", "bytetrack")  # 'bytetrack' or 'botsort'
    TRACKER_CONFIG: str = os.getenv("TRACKER_CONFIG", "config/tracker.yaml")
    MIN_HITS: int = int(os.getenv("MIN_HITS", "3"))  # Base frames required to confirm tracklet
    MAX_LOST_FRAMES: int = int(os.getenv("MAX_LOST_FRAMES", "75"))  # ~2.5 seconds at 30 fps
    RELINK: bool = os.getenv("RELINK", "true").lower() == "true"  # Re-ID re-linking for vanished tracks
    ENABLE_TILED_INFERENCE: bool = os.getenv("ENABLE_TILED_INFERENCE", "false").lower() == "true"
    TILED_OVERLAP: float = float(os.getenv("TILED_OVERLAP", "0.15"))
    
    # Advanced Filtering to Eliminate Spurious Real-Footage Ghosts (Round 3)
    MIN_BOX_WIDTH: float = float(os.getenv("MIN_BOX_WIDTH", "0.025"))
    MIN_BOX_HEIGHT: float = float(os.getenv("MIN_BOX_HEIGHT", "0.025"))
    MIN_BOX_AREA: float = float(os.getenv("MIN_BOX_AREA", "0.0008"))
    IGNORE_TOP_Y: float = float(os.getenv("IGNORE_TOP_Y", "0.06"))
    VEHICLE_NMS_IOU: float = float(os.getenv("VEHICLE_NMS_IOU", "0.50"))
    ADAPTIVE_MIN_HITS: bool = os.getenv("ADAPTIVE_MIN_HITS", "true").lower() == "true"
    
    # Upstream Core Service configuration
    CORE_SERVICE_URL: str = os.getenv("CORE_SERVICE_URL", "http://localhost:8080")
    SERVICE_TOKEN: str = os.getenv("SERVICE_TOKEN", "ibvap-internal-secret-token-change-in-prod")
    
    # Processing features
    ENABLE_LOW_LIGHT_CLAHE: bool = os.getenv("ENABLE_LOW_LIGHT_CLAHE", "true").lower() == "true"
    LOW_LIGHT_LUMINANCE_THRESHOLD: float = float(os.getenv("LOW_LIGHT_LUMINANCE_THRESHOLD", "60.0"))
    ENABLE_ANPR: bool = os.getenv("ENABLE_ANPR", "true").lower() == "true"
    ANPR_MIN_CONFIDENCE: float = float(os.getenv("ANPR_MIN_CONFIDENCE", "65.0"))
    
    # Allowed CORS Origins
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ]


settings = Settings()

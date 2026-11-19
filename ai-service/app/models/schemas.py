from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict


class BoundingBox(BaseModel):
    x: float = Field(..., description="Normalized 0 to 1 left coordinate")
    y: float = Field(..., description="Normalized 0 to 1 top coordinate")
    width: float = Field(..., description="Normalized 0 to 1 width")
    height: float = Field(..., description="Normalized 0 to 1 height")


class EntityAppearance(BaseModel):
    primaryColor: str
    secondaryColor: Optional[str] = None
    colorHex: Optional[str] = None
    clothingDescription: Optional[str] = None
    vehicleTypeDescription: Optional[str] = None
    colorHist: Optional[list[float]] = None


class ANPRResult(BaseModel):
    plateText: str
    confidence: float
    isReadable: bool
    isValidFormat: bool = False
    formatType: Optional[Literal["standard", "bharat", "invalid", "distance_gated"]] = "invalid"
    validationStatus: Optional[str] = "Unreadable / invalid format"
    recognitionState: Optional[str] = "DETECTED"  # DETECTED, OCR_PENDING, TENTATIVE, CONFIRMED, NEEDS_REVIEW, UNREADABLE
    isSyntacticMatch: bool = False
    standardNormalizedPlate: Optional[str] = None
    stateCode: Optional[str] = None
    rtoCode: Optional[str] = None
    series: Optional[str] = None
    plateNumber: Optional[str] = None
    cropDataUrl: Optional[str] = None
    plateCropDataUrl: Optional[str] = None
    vehicleCropDataUrl: Optional[str] = None
    charConfidences: Optional[list[float]] = None
    scaleUsed: Optional[str] = None
    attempts: Optional[int] = 1
    isDistanceGated: bool = False
    processedAt: int = 0
    isDualRow: bool = False
    stateName: Optional[str] = None
    rtoOffice: Optional[str] = None
    ocrModel: Optional[str] = "Awiros ANPR-OCR"
    vehicleClass: Optional[str] = None
    vehicleColor: Optional[str] = None
    vehicleColorHex: Optional[str] = None
    vehicleCategory: Optional[str] = None
    bodyType: Optional[str] = None
    visualCharacteristics: Optional[str] = None


class ImageANPRPlateItem(BaseModel):
    plateText: str
    confidence: float
    isReadable: bool = True
    isValidFormat: bool
    formatType: str
    validationStatus: str
    recognitionState: Optional[str] = "DETECTED"  # DETECTED, OCR_PENDING, TENTATIVE, CONFIRMED, NEEDS_REVIEW, UNREADABLE
    isSyntacticMatch: bool = False
    standardNormalizedPlate: Optional[str] = None
    stateCode: Optional[str] = None
    stateName: Optional[str] = None
    rtoCode: Optional[str] = None
    rtoOffice: Optional[str] = None
    isDualRow: bool = False
    vehicleClass: Optional[str] = None
    vehicleColor: Optional[str] = None
    vehicleColorHex: Optional[str] = None
    vehicleCategory: Optional[str] = None
    bodyType: Optional[str] = None
    visualCharacteristics: Optional[str] = None
    ocrModel: str = "Awiros ANPR-OCR"
    charConfidences: Optional[list[float]] = None
    plateCropDataUrl: Optional[str] = None
    vehicleCropDataUrl: Optional[str] = None
    bbox: Optional[BoundingBox] = None


class ImageANPRResponse(BaseModel):
    status: str
    count: int
    plates: list[ImageANPRPlateItem]
    latencyMs: float


class TrackedEntity(BaseModel):
    id: int
    class_name: str = Field(..., alias="class")
    confidence: int  # 0 to 100
    confidenceTier: Literal["high", "medium", "low"] = "medium"
    bbox: BoundingBox
    state: Literal["tentative", "confirmed", "lost", "removed"] = "confirmed"
    age: int = 1
    hits: int = 1
    velocity: float = 0.0  # approximate px/s
    speed: str = "0 px/s"
    direction: str = "Stationary"
    appearance: Optional[EntityAppearance] = None
    anpr: Optional[ANPRResult] = None
    headBbox: Optional[BoundingBox] = None
    footpoint: Optional[Point] = None
    isLoitering: bool = False
    hasCrossedZoneIds: list[str] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class Point(BaseModel):
    x: float
    y: float


class VirtualZone(BaseModel):
    id: str
    cameraId: str
    name: str
    type: Literal["line", "polygon"]
    points: list[Point]
    enabled: bool = True
    color: str = "#EF4444"
    direction: Optional[Literal["any", "left_to_right", "right_to_left", "inbound", "outbound"]] = "any"
    alertOnClasses: list[str] = Field(default_factory=lambda: ["person", "car", "truck"])
    createdAt: Optional[int] = None


class PossibleWeaponEntity(BaseModel):
    id: str
    subclass: Literal["firearm", "bladed_weapon", "blunt_object", "unknown"]
    confidence: float  # 0.0 to 1.0
    bbox: BoundingBox
    nearestPersonTrackId: Optional[int] = None
    label: str  # e.g. "weapon candidate near person #10"
    cropDataUrl: Optional[str] = None
    isConsecutiveConfirmed: bool = False
    consecutiveHits: int = 1
    isFriendlyZoneSuppressed: bool = False
    suppressionReason: Optional[str] = None
    verificationStatus: Literal["Needs operator verification", "AI-verified, needs operator confirmation", "Marked false positive"] = "Needs operator verification"
    detectedAt: float = 0.0


class ZoneEvent(BaseModel):
    id: str
    zoneId: str
    zoneName: str
    eventType: Literal["entry", "exit", "breach", "loiter"]
    objectId: int
    objectClass: str
    timestamp: int
    riskScore: int = 50
    details: Optional[str] = None


class SourceCreateRequest(BaseModel):
    source_id: Optional[str] = None
    source_type: Literal["file", "rtsp", "webcam"]
    source_url: str
    loop: bool = True


class SourceStatusResponse(BaseModel):
    source_id: str
    source_type: str
    source_url: str
    status: Literal["active", "connecting", "error", "stopped"]
    fps: float = 0.0
    width: int = 0
    height: int = 0
    total_frames: int = 0


class FrameStreamPayload(BaseModel):
    frame_index: int
    timestamp: int
    width: int
    height: int
    is_night_mode: bool = False
    average_luminance: float = 120.0
    entities: list[TrackedEntity] = Field(default_factory=list)
    zone_events: list[ZoneEvent] = Field(default_factory=list)
    plates: list[ANPRResult] = Field(default_factory=list)
    weapons: list[PossibleWeaponEntity] = Field(default_factory=list)

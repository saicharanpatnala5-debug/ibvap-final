import os
import shutil
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import (
    FastAPI,
    HTTPException,
    Header,
    UploadFile,
    File,
    Form,
    WebSocket,
    WebSocketDisconnect,
    Response,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.config import settings
from app.models.schemas import (
    SourceCreateRequest,
    SourceStatusResponse,
    FrameStreamPayload,
)
from app.services.video_source import VideoSourceManager
from app.services.core_client import CoreServiceClient

source_manager = VideoSourceManager()
core_client = CoreServiceClient()
UPLOAD_DIR = os.path.join(os.getcwd(), "data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print(f"[IBVAP AI-Service] Starting on {settings.HOST}:{settings.PORT}")
    yield
    # Shutdown
    print("[IBVAP AI-Service] Shutting down all active video sources...")
    source_manager.shutdown_all()


app = FastAPI(
    title="IBVAP AI Vision Service",
    description="High-performance vision pipeline: YOLO26, ByteTrack tracking, CLAHE, ANPR & Virtual Zones",
    version="1.0.0",
    lifespan=lifespan,
)

# Restricted CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "ai-service",
        "device": settings.DEVICE,
        "yolo_model": settings.YOLO_MODEL,
        "active_sources_count": len(source_manager.sources),
    }


@app.get("/sources")
def list_sources():
    return source_manager.list_sources()


@app.post("/sources", response_model=SourceStatusResponse)
async def create_source(
    source_type: str = Form("file"),
    source_url: Optional[str] = Form(None),
    loop: bool = Form(True),
    file: Optional[UploadFile] = File(None),
    x_service_token: Optional[str] = Header(None),
):
    source_id = f"cam-{uuid.uuid4().hex[:8]}"

    # Handle file upload if provided
    if file is not None:
        filename = os.path.basename(file.filename or "upload.mp4")
        allowed_extensions = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
        ext = os.path.splitext(filename)[1].lower()
        if ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid video format '{ext}'. Allowed: {allowed_extensions}",
            )

        dest_path = os.path.join(UPLOAD_DIR, f"{source_id}{ext}")
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        resolved_url = dest_path
        resolved_type = "file"
    elif source_url:
        resolved_url = source_url.strip()
        resolved_type = source_type
    else:
        raise HTTPException(
            status_code=400,
            detail="Either 'source_url' or a video 'file' upload is required.",
        )

    # Fetch configured zones from core-service for this camera
    zones = await core_client.fetch_camera_zones(source_id)

    source = source_manager.add_source(
        source_id=source_id,
        source_type=resolved_type,
        source_url=resolved_url,
        loop=loop,
        zones=zones,
    )

    return SourceStatusResponse(
        source_id=source.source_id,
        source_type=source.source_type,
        source_url=source.source_url,
        status=source.status,
        fps=source.fps,
        width=source.width,
        height=source.height,
        total_frames=source.total_frames,
    )


@app.delete("/sources/{source_id}")
def delete_source(source_id: str):
    removed = source_manager.remove_source(source_id)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Source '{source_id}' not found.")
    return {"message": f"Source '{source_id}' terminated successfully."}


@app.get("/state/{source_id}", response_model=Optional[FrameStreamPayload])
def get_source_state(source_id: str):
    source = source_manager.get_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail=f"Source '{source_id}' not found.")

    state = source.get_latest_state()
    if not state:
        return FrameStreamPayload(
            frame_index=0,
            timestamp=0,
            width=source.width,
            height=source.height,
            entities=[],
            zone_events=[],
            plates=[],
        )
    return state


@app.get("/frame/{source_id}")
def get_source_frame(source_id: str):
    source = source_manager.get_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail=f"Source '{source_id}' not found.")

    jpeg_bytes = source.get_latest_jpeg()
    if not jpeg_bytes:
        raise HTTPException(status_code=503, detail="No frame available yet from source.")

    return Response(content=jpeg_bytes, media_type="image/jpeg")


@app.get("/stream/{source_id}")
def get_mjpeg_stream(source_id: str):
    source = source_manager.get_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail=f"Source '{source_id}' not found.")

    def mjpeg_generator():
        import time

        while source.running:
            jpeg = source.get_latest_jpeg()
            if jpeg:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
                )
            time.sleep(1.0 / max(5.0, min(source.fps, 30.0)))

    return StreamingResponse(
        mjpeg_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.websocket("/ws/{source_id}")
async def websocket_source_stream(websocket: WebSocket, source_id: str):
    await websocket.accept()
    source = source_manager.get_source(source_id)
    if not source:
        await websocket.send_json(
            {"error": f"Source '{source_id}' is not active or not found."}
        )
        await websocket.close(code=1008)
        return

    source.subscribers.add(websocket)
    try:
        # Keep connection alive while subscriber is connected
        while True:
            # Client can send control messages (e.g. ping, zone toggle)
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        source.subscribers.discard(websocket)
    except Exception:
        source.subscribers.discard(websocket)

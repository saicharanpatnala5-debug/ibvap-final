#!/usr/bin/env python3
"""
Generates high-resolution architecture diagram PNG for docs/ONE_PAGER.md
"""

import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches

def generate_diagram(output_path: str):
    fig, ax = plt.subplots(figsize=(14, 8), dpi=200)
    ax.set_facecolor('#0f172a') # Slate 900
    fig.patch.set_facecolor('#0f172a')

    # Color palette
    c_client = '#0284c7'   # Sky 600
    c_gateway = '#6366f1'  # Indigo 500
    c_vision = '#10b981'   # Emerald 500
    c_core = '#f59e0b'     # Amber 500
    c_border = '#334155'   # Slate 700
    c_text = '#f8fafc'     # Slate 50

    # Helper function for drawing rounded boxes
    def draw_box(x, y, w, h, title, subtitle, items, color, border_color='#475569'):
        box = patches.FancyBboxPatch(
            (x, y), w, h,
            boxstyle="round,pad=0.02,rounding_size=0.03",
            facecolor=color, edgecolor=border_color, linewidth=1.5, zorder=2
        )
        ax.add_patch(box)
        ax.text(x + 0.03, y + h - 0.05, title, fontsize=12, fontweight='bold', color=c_text, zorder=3)
        if subtitle:
            ax.text(x + 0.03, y + h - 0.09, subtitle, fontsize=9, fontstyle='italic', color='#cbd5e1', zorder=3)
        
        y_text = y + h - 0.14
        for item in items:
            ax.text(x + 0.04, y_text, f"• {item}", fontsize=8.5, color='#e2e8f0', zorder=3)
            y_text -= 0.035

    # 1. Client Layer
    draw_box(
        0.05, 0.55, 0.26, 0.38,
        "1. OPERATOR CLIENT",
        "React 19 Workstation (frontend/)",
        [
            "VMS Multi-Camera Grid & HUD",
            "Continuous Timeline Scrubber",
            "Real-Time Zone Bounding Overlays",
            "Onnxruntime-Web Worker Fallback",
            "Docked AI Copilot Drawer (Ctrl+K)"
        ],
        '#1e293b'
    )

    # 2. Gateway Layer
    draw_box(
        0.37, 0.55, 0.26, 0.38,
        "2. API GATEWAY",
        "Express 4 Reverse Proxy (gateway/ :3000)",
        [
            "Single Public Port (:3000)",
            "Aggregated Health (/api/health)",
            "Helmet Security & Rate Limiting",
            "Gemini 2.5 Flash Copilot Host",
            "Deterministic Grounded Local Fallback"
        ],
        '#1e293b'
    )

    # 3. Vision Analytics Layer
    draw_box(
        0.69, 0.55, 0.26, 0.38,
        "3. VISION ANALYTICS",
        "Python FastAPI Service (ai-service/ :8000)",
        [
            "Ultralytics YOLO26 Object Detection",
            "ByteTrack Multi-Target Kinematics",
            "Fast-ALPR ONNX (YOLO-v9-t + CCT-S-v2)",
            "CLAHE Adaptive Night Enhancement",
            "Physical Distance Gating & Validation"
        ],
        '#1e293b'
    )

    # 4. System of Record (Core Service)
    draw_box(
        0.37, 0.08, 0.26, 0.38,
        "4. SYSTEM OF RECORD",
        "Java 21 LTS / Spring Boot 3 (core-service/ :8080)",
        [
            "Camera & Sensor Registry",
            "Virtual Boundary Zone Definitions",
            "Incident State Machine & SSE Push",
            "Immutable Cryptographic Audit Trail",
            "Real-Time Risk Scoring Engine"
        ],
        '#1e293b'
    )

    # Connecting Arrows
    def draw_arrow(x1, y1, x2, y2, label=""):
        arrow = patches.FancyArrowPatch(
            (x1, y1), (x2, y2),
            arrowstyle='->,head_width=5,head_length=8',
            color='#38bdf8', linewidth=2, zorder=4
        )
        ax.add_patch(arrow)
        if label:
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            ax.text(mx, my + 0.02, label, fontsize=8, color='#38bdf8', ha='center', fontweight='bold', zorder=5)

    # UI <-> Gateway
    draw_arrow(0.31, 0.74, 0.37, 0.74, "HTTP / WS")
    draw_arrow(0.37, 0.70, 0.31, 0.70, "Telemetry")

    # Gateway <-> Vision Service
    draw_arrow(0.63, 0.74, 0.69, 0.74, "Frames (JSON)")
    draw_arrow(0.69, 0.70, 0.63, 0.70, "Detections")

    # Gateway <-> Core Service
    draw_arrow(0.50, 0.55, 0.50, 0.46, "/api/core/*")
    draw_arrow(0.53, 0.46, 0.53, 0.55, "Events / SSE")

    # Vision <-> Core
    draw_arrow(0.72, 0.55, 0.63, 0.35, "Zone Polygons")

    # Title Banner
    ax.text(0.50, 0.96, "IBVAP POLYGLOT MULTI-SERVICE TARGET ARCHITECTURE", fontsize=15, fontweight='bold', color='#fbbf24', ha='center')
    ax.text(0.50, 0.93, "High-Assurance Perimeter Defense, Kinematics Tracking, ANPR & Forensics", fontsize=10, color='#94a3b8', ha='center')

    ax.set_xlim(0, 1.0)
    ax.set_ylim(0, 1.0)
    ax.axis('off')

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    plt.tight_layout()
    plt.savefig(output_path, bbox_inches='tight', facecolor=fig.get_facecolor(), edgecolor='none')
    plt.close()
    print(f"Architecture diagram saved to: {output_path}")

if __name__ == "__main__":
    out = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "docs", "architecture_diagram.png"))
    generate_diagram(out)

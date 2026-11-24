-- =============================================================================
-- IBVAP 2026 - Master Database Schema (PRD Sections 13-14)
-- Core Service PostgreSQL / ANSI SQL Schema
-- =============================================================================

-- 1. Users & RBAC
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'OPERATOR', -- ADMIN, OPERATOR
    full_name VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Cameras & Video Sources
CREATE TABLE IF NOT EXISTS cameras (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    location VARCHAR(256),
    stream_url VARCHAR(512),
    status VARCHAR(32) DEFAULT 'ONLINE', -- ONLINE, OFFLINE, ALERT
    fps DOUBLE PRECISION DEFAULT 30.0,
    resolution VARCHAR(32) DEFAULT '1920x1080',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Virtual Zones & Perimeters
CREATE TABLE IF NOT EXISTS virtual_zones (
    id VARCHAR(64) PRIMARY KEY,
    camera_id VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    type VARCHAR(32) DEFAULT 'RESTRICTED', -- RESTRICTED, WARNING, ENTRY, BUFFER
    polygon TEXT, -- JSON coordinates: [{"x":0.1, "y":0.2}, ...]
    color VARCHAR(32) DEFAULT '#EF4444',
    active BOOLEAN DEFAULT TRUE
);

-- 4. Vehicle Records (Plates, Sightings, & National Registry Cache)
CREATE TABLE IF NOT EXISTS vehicle_records (
    id VARCHAR(64) PRIMARY KEY,
    plate_number VARCHAR(32),
    normalized_plate VARCHAR(32),
    status VARCHAR(32) DEFAULT 'UNREGISTERED', -- VERIFIED, WATCHLIST, STOLEN, UNREGISTERED, UNREADABLE, LOW_CONFIDENCE
    owner VARCHAR(128),
    state VARCHAR(64),
    vehicle_type VARCHAR(64), -- SEDAN, SUV, TRUCK, MOTORCYCLE, COMMERCIAL, AUTO_RICKSHAW
    make VARCHAR(64),
    model VARCHAR(64),
    color VARCHAR(64),
    confidence DOUBLE PRECISION DEFAULT 1.0,
    camera_id VARCHAR(64),
    camera_name VARCHAR(128),
    track_id BIGINT,
    timestamp_in_source DOUBLE PRECISION,
    plate_crop_base64 TEXT,
    vehicle_crop_base64 TEXT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    schema_version VARCHAR(32) DEFAULT 'v8.0.0',
    run_id VARCHAR(64) DEFAULT 'r8-release-20261115'
);
CREATE INDEX IF NOT EXISTS idx_vehicle_norm_plate ON vehicle_records(normalized_plate);
CREATE INDEX IF NOT EXISTS idx_vehicle_recorded_at ON vehicle_records(recorded_at DESC);

-- 5. Incidents (Fused Event Story, PRD Section 6)
CREATE TABLE IF NOT EXISTS incidents (
    id VARCHAR(64) PRIMARY KEY,
    incident_number VARCHAR(64) UNIQUE NOT NULL,
    camera_id VARCHAR(64),
    camera_name VARCHAR(128),
    title VARCHAR(256) NOT NULL,
    description TEXT,
    severity VARCHAR(32) DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, CRITICAL
    status VARCHAR(32) DEFAULT 'OPEN',     -- OPEN, ACKNOWLEDGED, ESCALATED, CLOSED
    risk_score DOUBLE PRECISION DEFAULT 50.0,
    primary_entity VARCHAR(128),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    contributing_factors TEXT, -- JSON list of contributing risk factors
    event_ids TEXT,            -- JSON list of fused event IDs
    evidence_clip_url VARCHAR(512),
    acknowledged_by VARCHAR(64),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    escalated_by VARCHAR(64),
    escalated_at TIMESTAMP WITH TIME ZONE,
    closed_by VARCHAR(64),
    closed_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_incident_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incident_started ON incidents(started_at DESC);

-- 6. Events (Fine-grained Telemetry & Detections)
CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(64) PRIMARY KEY,
    camera_id VARCHAR(64),
    camera_name VARCHAR(128),
    event_type VARCHAR(64) NOT NULL, -- TELEMETRY, INTRUSION, LOITERING, ANPR, RISK_UPDATE, SPEED
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    track_id BIGINT,
    object_class VARCHAR(64),
    confidence DOUBLE PRECISION DEFAULT 1.0,
    bbox_json TEXT,
    zone_id VARCHAR(64),
    incident_id VARCHAR(64),
    details_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_event_incident ON events(incident_id);
CREATE INDEX IF NOT EXISTS idx_event_camera_time ON events(camera_id, timestamp DESC);

-- 7. Alert Incidents (Real-time Push Alerts)
CREATE TABLE IF NOT EXISTS alert_incidents (
    id VARCHAR(64) PRIMARY KEY,
    camera_id VARCHAR(64),
    camera_name VARCHAR(128),
    severity VARCHAR(32) DEFAULT 'MEDIUM',
    type VARCHAR(64) NOT NULL,
    description TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(32) DEFAULT 'OPEN',
    metadata TEXT,
    schema_version VARCHAR(32) DEFAULT 'v8.0.0',
    run_id VARCHAR(64) DEFAULT 'r8-release-20261115'
);

-- 8. Append-Only Audit Log (PRD Section 14)
CREATE TABLE IF NOT EXISTS audit_log (
    id VARCHAR(64) PRIMARY KEY,
    actor VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL, -- CREATE, UPDATE, DELETE, ACKNOWLEDGE, ESCALATE, CLOSE, LOGIN, RESET, CONFIG_CHANGE
    target_type VARCHAR(64) NOT NULL, -- CAMERA, ZONE, ALERT, INCIDENT, VEHICLE, CONFIG, SYSTEM
    target_id VARCHAR(64),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    details TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(timestamp DESC);

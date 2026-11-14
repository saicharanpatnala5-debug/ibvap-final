package com.ibvap.core.model;

import java.time.Instant;
import java.util.Map;

public class AlertIncident {
    private String id;
    private String cameraId;
    private String cameraName;
    private String severity; // LOW, MEDIUM, HIGH, CRITICAL
    private String type;     // ZONE_BREACH, UNKNOWN_VEHICLE, SUSPICIOUS_LOITERING, NIGHT_ACTIVITY
    private String description;
    private Instant timestamp;
    private String status;    // OPEN, ACKNOWLEDGED, RESOLVED
    private Map<String, Object> metadata;

    public AlertIncident() {
        this.timestamp = Instant.now();
        this.status = "OPEN";
        this.severity = "MEDIUM";
    }

    public AlertIncident(String id, String cameraId, String cameraName, String severity, String type, String description) {
        this();
        this.id = id;
        this.cameraId = cameraId;
        this.cameraName = cameraName;
        this.severity = severity;
        this.type = type;
        this.description = description;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getCameraId() { return cameraId; }
    public void setCameraId(String cameraId) { this.cameraId = cameraId; }

    public String getCameraName() { return cameraName; }
    public void setCameraName(String cameraName) { this.cameraName = cameraName; }

    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Instant getTimestamp() { return timestamp; }
    public void setTimestamp(Instant timestamp) { this.timestamp = timestamp; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Map<String, Object> getMetadata() { return metadata; }
    public void setMetadata(Map<String, Object> metadata) { this.metadata = metadata; }
}

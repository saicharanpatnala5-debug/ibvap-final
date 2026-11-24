package com.ibvap.core.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "events")
public class Event {
    @Id
    private String id;
    private String cameraId;
    private String cameraName;
    private String eventType; // TELEMETRY, INTRUSION, LOITERING, ANPR, RISK_UPDATE, SPEED, BREACH
    private Instant timestamp;
    private Long trackId;
    private String objectClass;
    private double confidence;

    @Column(columnDefinition = "TEXT")
    private String bboxJson;

    private String zoneId;
    private String incidentId;

    @Column(columnDefinition = "TEXT")
    private String detailsJson;

    public Event() {
        this.id = UUID.randomUUID().toString();
        this.timestamp = Instant.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getCameraId() { return cameraId; }
    public void setCameraId(String cameraId) { this.cameraId = cameraId; }

    public String getCameraName() { return cameraName; }
    public void setCameraName(String cameraName) { this.cameraName = cameraName; }

    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }

    public Instant getTimestamp() { return timestamp; }
    public void setTimestamp(Instant timestamp) { this.timestamp = timestamp; }

    public Long getTrackId() { return trackId; }
    public void setTrackId(Long trackId) { this.trackId = trackId; }

    public String getObjectClass() { return objectClass; }
    public void setObjectClass(String objectClass) { this.objectClass = objectClass; }

    public double getConfidence() { return confidence; }
    public void setConfidence(double confidence) { this.confidence = confidence; }

    public String getBboxJson() { return bboxJson; }
    public void setBboxJson(String bboxJson) { this.bboxJson = bboxJson; }

    public String getZoneId() { return zoneId; }
    public void setZoneId(String zoneId) { this.zoneId = zoneId; }

    public String getIncidentId() { return incidentId; }
    public void setIncidentId(String incidentId) { this.incidentId = incidentId; }

    public String getDetailsJson() { return detailsJson; }
    public void setDetailsJson(String detailsJson) { this.detailsJson = detailsJson; }
}

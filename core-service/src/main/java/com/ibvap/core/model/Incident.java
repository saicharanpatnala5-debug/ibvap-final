package com.ibvap.core.model;

import com.ibvap.core.config.JpaConverters;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "incidents")
public class Incident {
    @Id
    private String id;
    private String incidentNumber;
    private String cameraId;
    private String cameraName;
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    private String severity; // LOW, MEDIUM, HIGH, CRITICAL
    private String status;   // OPEN, ACKNOWLEDGED, ESCALATED, CLOSED
    private double riskScore;
    private String primaryEntity;
    private Instant startedAt;
    private Instant endedAt;

    @Convert(converter = JpaConverters.StringListConverter.class)
    @Column(columnDefinition = "TEXT")
    private List<String> contributingFactors = new ArrayList<>();

    @Convert(converter = JpaConverters.StringListConverter.class)
    @Column(columnDefinition = "TEXT")
    private List<String> eventIds = new ArrayList<>();

    private String evidenceClipUrl;
    private String acknowledgedBy;
    private Instant acknowledgedAt;
    private String escalatedBy;
    private Instant escalatedAt;
    private String closedBy;
    private Instant closedAt;

    @Column(columnDefinition = "TEXT")
    private String resolutionNotes;

    public Incident() {
        this.id = UUID.randomUUID().toString();
        this.incidentNumber = "INC-" + System.currentTimeMillis();
        this.status = "OPEN";
        this.severity = "MEDIUM";
        this.startedAt = Instant.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getIncidentNumber() { return incidentNumber; }
    public void setIncidentNumber(String incidentNumber) { this.incidentNumber = incidentNumber; }

    public String getCameraId() { return cameraId; }
    public void setCameraId(String cameraId) { this.cameraId = cameraId; }

    public String getCameraName() { return cameraName; }
    public void setCameraName(String cameraName) { this.cameraName = cameraName; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public double getRiskScore() { return riskScore; }
    public void setRiskScore(double riskScore) { this.riskScore = riskScore; }

    public String getPrimaryEntity() { return primaryEntity; }
    public void setPrimaryEntity(String primaryEntity) { this.primaryEntity = primaryEntity; }

    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }

    public Instant getEndedAt() { return endedAt; }
    public void setEndedAt(Instant endedAt) { this.endedAt = endedAt; }

    public List<String> getContributingFactors() {
        return contributingFactors != null ? contributingFactors : new ArrayList<>();
    }

    public void setContributingFactors(List<String> contributingFactors) {
        this.contributingFactors = contributingFactors != null ? contributingFactors : new ArrayList<>();
    }

    public List<String> getEventIds() {
        return eventIds != null ? eventIds : new ArrayList<>();
    }

    public void setEventIds(List<String> eventIds) {
        this.eventIds = eventIds != null ? eventIds : new ArrayList<>();
    }

    public String getEvidenceClipUrl() { return evidenceClipUrl; }
    public void setEvidenceClipUrl(String evidenceClipUrl) { this.evidenceClipUrl = evidenceClipUrl; }

    public String getAcknowledgedBy() { return acknowledgedBy; }
    public void setAcknowledgedBy(String acknowledgedBy) { this.acknowledgedBy = acknowledgedBy; }

    public Instant getAcknowledgedAt() { return acknowledgedAt; }
    public void setAcknowledgedAt(Instant acknowledgedAt) { this.acknowledgedAt = acknowledgedAt; }

    public String getEscalatedBy() { return escalatedBy; }
    public void setEscalatedBy(String escalatedBy) { this.escalatedBy = escalatedBy; }

    public Instant getEscalatedAt() { return escalatedAt; }
    public void setEscalatedAt(Instant escalatedAt) { this.escalatedAt = escalatedAt; }

    public String getClosedBy() { return closedBy; }
    public void setClosedBy(String closedBy) { this.closedBy = closedBy; }

    public Instant getClosedAt() { return closedAt; }
    public void setClosedAt(Instant closedAt) { this.closedAt = closedAt; }

    public String getResolutionNotes() { return resolutionNotes; }
    public void setResolutionNotes(String resolutionNotes) { this.resolutionNotes = resolutionNotes; }
}

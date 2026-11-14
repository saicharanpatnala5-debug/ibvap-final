package com.ibvap.core.model;

import java.time.Instant;
import java.util.Map;

public class AuditEntry {
    private String id;
    private String actor;
    private String action; // CREATE, UPDATE, DELETE, ACKNOWLEDGE, RESOLVE, LOGIN, OVERRIDE
    private String targetType; // CAMERA, ZONE, ALERT, VEHICLE, SYSTEM
    private String targetId;
    private Instant timestamp;
    private Map<String, Object> details;

    public AuditEntry() {
        this.timestamp = Instant.now();
    }

    public AuditEntry(String id, String actor, String action, String targetType, String targetId, Map<String, Object> details) {
        this.id = id;
        this.actor = actor;
        this.action = action;
        this.targetType = targetType;
        this.targetId = targetId;
        this.details = details;
        this.timestamp = Instant.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getActor() { return actor; }
    public void setActor(String actor) { this.actor = actor; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getTargetType() { return targetType; }
    public void setTargetType(String targetType) { this.targetType = targetType; }

    public String getTargetId() { return targetId; }
    public void setTargetId(String targetId) { this.targetId = targetId; }

    public Instant getTimestamp() { return timestamp; }
    public void setTimestamp(Instant timestamp) { this.timestamp = timestamp; }

    public Map<String, Object> getDetails() { return details; }
    public void setDetails(Map<String, Object> details) { this.details = details; }
}

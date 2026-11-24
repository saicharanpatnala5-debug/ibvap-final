package com.ibvap.core.model;

import com.ibvap.core.config.JpaConverters;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "audit_log")
public class AuditEntry {
    @Id
    private String id;
    private String actor;
    private String action; // CREATE, UPDATE, DELETE, ACKNOWLEDGE, ESCALATE, CLOSE, LOGIN, OVERRIDE, RESET, CONFIG_CHANGE
    private String targetType; // CAMERA, ZONE, ALERT, INCIDENT, VEHICLE, CONFIG, SYSTEM
    private String targetId;
    private Instant timestamp;

    @Convert(converter = JpaConverters.JsonMapConverter.class)
    @Column(columnDefinition = "TEXT")
    private Map<String, Object> details = new HashMap<>();

    public AuditEntry() {
        this.id = UUID.randomUUID().toString();
        this.timestamp = Instant.now();
    }

    public AuditEntry(String id, String actor, String action, String targetType, String targetId, Map<String, Object> details) {
        this.id = id != null ? id : UUID.randomUUID().toString();
        this.actor = actor;
        this.action = action;
        this.targetType = targetType;
        this.targetId = targetId;
        this.timestamp = Instant.now();
        this.details = details != null ? details : new HashMap<>();
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

    public Map<String, Object> getDetails() {
        return details != null ? details : new HashMap<>();
    }

    public void setDetails(Map<String, Object> details) {
        this.details = details != null ? details : new HashMap<>();
    }
}

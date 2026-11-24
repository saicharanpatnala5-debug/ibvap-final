package com.ibvap.core.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "cameras")
public class Camera {
    @Id
    private String id;
    private String name;
    private String location;
    private String streamUrl;
    private String status; // ONLINE, OFFLINE, ALERT
    private double fps;
    private String resolution;
    private Instant createdAt;

    public Camera() {
        this.createdAt = Instant.now();
        this.status = "ONLINE";
        this.fps = 30.0;
        this.resolution = "1920x1080";
    }

    public Camera(String id, String name, String location, String streamUrl) {
        this();
        this.id = id;
        this.name = name;
        this.location = location;
        this.streamUrl = streamUrl;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }

    public String getStreamUrl() { return streamUrl; }
    public void setStreamUrl(String streamUrl) { this.streamUrl = streamUrl; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public double getFps() { return fps; }
    public void setFps(double fps) { this.fps = fps; }

    public String getResolution() { return resolution; }
    public void setResolution(String resolution) { this.resolution = resolution; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}

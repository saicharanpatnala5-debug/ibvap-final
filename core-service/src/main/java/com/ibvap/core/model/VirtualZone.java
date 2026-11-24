package com.ibvap.core.model;

import com.ibvap.core.config.JpaConverters;
import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "virtual_zones")
public class VirtualZone {
    @Id
    private String id;
    private String cameraId;
    private String name;
    private String type; // RESTRICTED, WARNING, ENTRY, BUFFER

    @Convert(converter = JpaConverters.Point2DListConverter.class)
    @Column(columnDefinition = "TEXT")
    private List<Point2D> polygon = new ArrayList<>();

    private String color;
    private boolean active;

    public static class Point2D {
        private double x;
        private double y;

        public Point2D() {}
        public Point2D(double x, double y) {
            this.x = x;
            this.y = y;
        }

        public double getX() { return x; }
        public void setX(double x) { this.x = x; }

        public double getY() { return y; }
        public void setY(double y) { this.y = y; }
    }

    public VirtualZone() {
        this.active = true;
        this.color = "#EF4444";
        this.type = "RESTRICTED";
    }

    public VirtualZone(String id, String cameraId, String name, String type, List<Point2D> polygon) {
        this();
        this.id = id;
        this.cameraId = cameraId;
        this.name = name;
        this.type = type;
        this.polygon = polygon != null ? new ArrayList<>(polygon) : new ArrayList<>();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getCameraId() { return cameraId; }
    public void setCameraId(String cameraId) { this.cameraId = cameraId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public List<Point2D> getPolygon() {
        return polygon != null ? polygon : new ArrayList<>();
    }

    public void setPolygon(List<Point2D> polygon) {
        this.polygon = polygon != null ? new ArrayList<>(polygon) : new ArrayList<>();
    }

    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}

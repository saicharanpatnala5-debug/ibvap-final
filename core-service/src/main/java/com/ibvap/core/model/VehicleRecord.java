package com.ibvap.core.model;

import java.time.Instant;

public class VehicleRecord {
    private String plateNumber;
    private String normalizedPlate;
    private String status; // VERIFIED, WATCHLIST, STOLEN, UNREGISTERED, UNREADABLE, LOW_CONFIDENCE
    private String owner;
    private String state;
    private String vehicleType; // SEDAN, SUV, TRUCK, MOTORCYCLE, COMMERCIAL
    private String make;
    private String model;
    private String color;
    private double confidence;
    private String cameraId;
    private String cameraName;
    private Long trackId;
    private Double timestampInSource;
    private String plateCropBase64;
    private String vehicleCropBase64;
    private Instant recordedAt;
    private String notes;
    private String schemaVersion = "v8.0.0";
    private String runId = "r8-release-20261115";

    public VehicleRecord() {
        this.recordedAt = Instant.now();
        this.status = "UNREGISTERED";
        this.confidence = 1.0;
        this.schemaVersion = "v8.0.0";
        this.runId = "r8-release-20261115";
    }

    public VehicleRecord(String plateNumber, String status, String owner, String state, String vehicleType, String make, String model) {
        this();
        this.plateNumber = plateNumber;
        this.normalizedPlate = plateNumber != null ? plateNumber.replaceAll("[^A-Z0-9]", "").toUpperCase() : "";
        this.status = status;
        this.owner = owner;
        this.state = state;
        this.vehicleType = vehicleType;
        this.make = make;
        this.model = model;
    }

    public String getPlateNumber() { return plateNumber; }
    public void setPlateNumber(String plateNumber) {
        this.plateNumber = plateNumber;
        if (plateNumber != null) {
            this.normalizedPlate = plateNumber.replaceAll("[^A-Z0-9]", "").toUpperCase();
        }
    }

    public String getNormalizedPlate() { return normalizedPlate; }
    public void setNormalizedPlate(String normalizedPlate) { this.normalizedPlate = normalizedPlate; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getOwner() { return owner; }
    public void setOwner(String owner) { this.owner = owner; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getVehicleType() { return vehicleType; }
    public void setVehicleType(String vehicleType) { this.vehicleType = vehicleType; }

    public String getMake() { return make; }
    public void setMake(String make) { this.make = make; }

    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }

    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }

    public double getConfidence() { return confidence; }
    public void setConfidence(double confidence) { this.confidence = confidence; }

    public String getCameraId() { return cameraId; }
    public void setCameraId(String cameraId) { this.cameraId = cameraId; }

    public String getCameraName() { return cameraName; }
    public void setCameraName(String cameraName) { this.cameraName = cameraName; }

    public Long getTrackId() { return trackId; }
    public void setTrackId(Long trackId) { this.trackId = trackId; }

    public Double getTimestampInSource() { return timestampInSource; }
    public void setTimestampInSource(Double timestampInSource) { this.timestampInSource = timestampInSource; }

    public String getPlateCropBase64() { return plateCropBase64; }
    public void setPlateCropBase64(String plateCropBase64) { this.plateCropBase64 = plateCropBase64; }

    public String getVehicleCropBase64() { return vehicleCropBase64; }
    public void setVehicleCropBase64(String vehicleCropBase64) { this.vehicleCropBase64 = vehicleCropBase64; }

    public Instant getRecordedAt() { return recordedAt; }
    public void setRecordedAt(Instant recordedAt) { this.recordedAt = recordedAt; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public String getSchemaVersion() { return schemaVersion; }
    public void setSchemaVersion(String schemaVersion) { this.schemaVersion = schemaVersion; }

    public String getRunId() { return runId; }
    public void setRunId(String runId) { this.runId = runId; }
}

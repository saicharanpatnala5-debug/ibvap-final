package com.ibvap.core.model;

import java.util.List;

public class RiskScoreRequest {
    private String cameraId;
    private int personCount;
    private int vehicleCount;
    private int restrictedZoneBreachCount;
    private int unverifiedVehicleCount;
    private int loiteringCount;
    private boolean nightTime;
    private List<String> detectedPlates;

    public RiskScoreRequest() {}

    public String getCameraId() { return cameraId; }
    public void setCameraId(String cameraId) { this.cameraId = cameraId; }

    public int getPersonCount() { return personCount; }
    public void setPersonCount(int personCount) { this.personCount = personCount; }

    public int getVehicleCount() { return vehicleCount; }
    public void setVehicleCount(int vehicleCount) { this.vehicleCount = vehicleCount; }

    public int getRestrictedZoneBreachCount() { return restrictedZoneBreachCount; }
    public void setRestrictedZoneBreachCount(int restrictedZoneBreachCount) { this.restrictedZoneBreachCount = restrictedZoneBreachCount; }

    public int getUnverifiedVehicleCount() { return unverifiedVehicleCount; }
    public void setUnverifiedVehicleCount(int unverifiedVehicleCount) { this.unverifiedVehicleCount = unverifiedVehicleCount; }

    public int getLoiteringCount() { return loiteringCount; }
    public void setLoiteringCount(int loiteringCount) { this.loiteringCount = loiteringCount; }

    public boolean isNightTime() { return nightTime; }
    public void setNightTime(boolean nightTime) { this.nightTime = nightTime; }

    public List<String> getDetectedPlates() { return detectedPlates; }
    public void setDetectedPlates(List<String> detectedPlates) { this.detectedPlates = detectedPlates; }
}

package com.ibvap.core.service;

import com.ibvap.core.model.RiskScoreRequest;
import com.ibvap.core.model.RiskScoreResponse;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Service
public class RiskScoringService {

    public RiskScoreResponse evaluate(RiskScoreRequest request) {
        String cameraId = request.getCameraId() != null ? request.getCameraId() : "general";

        int restrictedBreaches = Math.max(0, request.getRestrictedZoneBreachCount());
        int unverifiedVehicles = Math.max(0, request.getUnverifiedVehicleCount());
        int loiterers = Math.max(0, request.getLoiteringCount());
        int persons = Math.max(0, request.getPersonCount());
        int vehicles = Math.max(0, request.getVehicleCount());
        boolean night = request.isNightTime();

        int zonePoints = Math.min(45, restrictedBreaches * 35);
        int nightPoints = night ? 15 : 0;
        int unverifiedPoints = Math.min(30, unverifiedVehicles * 20);
        int loiterPoints = Math.min(25, loiterers * 15);
        int densityPoints = Math.min(20, (persons + vehicles) * 3);

        int totalScore = Math.min(100, zonePoints + nightPoints + unverifiedPoints + loiterPoints + densityPoints);

        String level;
        String recommendation;

        if (totalScore >= 75) {
            level = "CRITICAL";
            recommendation = "Immediate tactical intercept required. Alert perimeter quick reaction team.";
        } else if (totalScore >= 50) {
            level = "HIGH";
            recommendation = "High risk activity detected. Direct PTZ cameras and dispatch ground patrol.";
        } else if (totalScore >= 25) {
            level = "MEDIUM";
            recommendation = "Heightened monitoring advised. Track suspicious entities across adjacent sectors.";
        } else {
            level = "LOW";
            recommendation = "Standard automated patrol. No anomalous security threats detected.";
        }

        Map<String, Integer> breakdown = new HashMap<>();
        breakdown.put("zoneBreachPoints", zonePoints);
        breakdown.put("nightFactorPoints", nightPoints);
        breakdown.put("unverifiedVehiclePoints", unverifiedPoints);
        breakdown.put("loiteringPoints", loiterPoints);
        breakdown.put("densityPoints", densityPoints);

        return new RiskScoreResponse(cameraId, totalScore, level, breakdown, recommendation);
    }
}

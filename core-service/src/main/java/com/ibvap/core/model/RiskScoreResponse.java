package com.ibvap.core.model;

import java.time.Instant;
import java.util.Map;

public class RiskScoreResponse {
    private String cameraId;
    private int score; // 0 to 100
    private String level; // LOW, MEDIUM, HIGH, CRITICAL
    private Map<String, Integer> breakdown;
    private String recommendation;
    private Instant evaluatedAt;

    public RiskScoreResponse() {
        this.evaluatedAt = Instant.now();
    }

    public RiskScoreResponse(String cameraId, int score, String level, Map<String, Integer> breakdown, String recommendation) {
        this();
        this.cameraId = cameraId;
        this.score = score;
        this.level = level;
        this.breakdown = breakdown;
        this.recommendation = recommendation;
    }

    public String getCameraId() { return cameraId; }
    public void setCameraId(String cameraId) { this.cameraId = cameraId; }

    public int getScore() { return score; }
    public void setScore(int score) { this.score = score; }

    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }

    public Map<String, Integer> getBreakdown() { return breakdown; }
    public void setBreakdown(Map<String, Integer> breakdown) { this.breakdown = breakdown; }

    public String getRecommendation() { return recommendation; }
    public void setRecommendation(String recommendation) { this.recommendation = recommendation; }

    public Instant getEvaluatedAt() { return evaluatedAt; }
    public void setEvaluatedAt(Instant evaluatedAt) { this.evaluatedAt = evaluatedAt; }
}

package com.ibvap.core;

import com.ibvap.core.model.RiskScoreRequest;
import com.ibvap.core.model.RiskScoreResponse;
import com.ibvap.core.service.RiskScoringService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RiskScoringServiceTest {

    private RiskScoringService riskScoringService;

    @BeforeEach
    void setUp() {
        riskScoringService = new RiskScoringService();
    }

    @Test
    void testZeroActivityGivesZeroScoreAndLowLevel() {
        RiskScoreRequest req = new RiskScoreRequest();
        req.setCameraId("cam-1");
        RiskScoreResponse res = riskScoringService.evaluate(req);

        assertEquals(0, res.getScore());
        assertEquals("LOW", res.getLevel());
        assertNotNull(res.getRecommendation());
    }

    @Test
    void testRestrictedBreachAndNightGivesHighOrCriticalScore() {
        RiskScoreRequest req = new RiskScoreRequest();
        req.setCameraId("cam-north");
        req.setRestrictedZoneBreachCount(2); // 2 * 35 = 70 (capped at 45)
        req.setNightTime(true);              // 15
        req.setUnverifiedVehicleCount(1);    // 20
        RiskScoreResponse res = riskScoringService.evaluate(req);

        // 45 + 15 + 20 = 80 -> CRITICAL
        assertEquals(80, res.getScore());
        assertEquals("CRITICAL", res.getLevel());
        assertTrue(res.getRecommendation().toLowerCase().contains("immediate"));
    }

    @Test
    void testScoreIsClampedAt100() {
        RiskScoreRequest req = new RiskScoreRequest();
        req.setRestrictedZoneBreachCount(10);
        req.setNightTime(true);
        req.setUnverifiedVehicleCount(10);
        req.setLoiteringCount(10);
        req.setPersonCount(50);
        req.setVehicleCount(50);
        RiskScoreResponse res = riskScoringService.evaluate(req);

        assertEquals(100, res.getScore());
        assertEquals("CRITICAL", res.getLevel());
    }
}

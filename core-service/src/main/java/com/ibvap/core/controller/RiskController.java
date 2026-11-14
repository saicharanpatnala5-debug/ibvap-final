package com.ibvap.core.controller;

import com.ibvap.core.model.RiskScoreRequest;
import com.ibvap.core.model.RiskScoreResponse;
import com.ibvap.core.service.RiskScoringService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/risk")
public class RiskController {
    private final RiskScoringService riskScoringService;

    public RiskController(RiskScoringService riskScoringService) {
        this.riskScoringService = riskScoringService;
    }

    @PostMapping("/evaluate")
    public ResponseEntity<RiskScoreResponse> evaluateRisk(@RequestBody RiskScoreRequest request) {
        return ResponseEntity.ok(riskScoringService.evaluate(request));
    }

    @GetMapping("/evaluate")
    public ResponseEntity<RiskScoreResponse> evaluateRiskQuery(
            @RequestParam(required = false, defaultValue = "general") String cameraId,
            @RequestParam(required = false, defaultValue = "0") int personCount,
            @RequestParam(required = false, defaultValue = "0") int vehicleCount,
            @RequestParam(required = false, defaultValue = "0") int restrictedZoneBreachCount,
            @RequestParam(required = false, defaultValue = "0") int unverifiedVehicleCount,
            @RequestParam(required = false, defaultValue = "0") int loiteringCount,
            @RequestParam(required = false, defaultValue = "false") boolean nightTime) {
        RiskScoreRequest req = new RiskScoreRequest();
        req.setCameraId(cameraId);
        req.setPersonCount(personCount);
        req.setVehicleCount(vehicleCount);
        req.setRestrictedZoneBreachCount(restrictedZoneBreachCount);
        req.setUnverifiedVehicleCount(unverifiedVehicleCount);
        req.setLoiteringCount(loiteringCount);
        req.setNightTime(nightTime);
        return ResponseEntity.ok(riskScoringService.evaluate(req));
    }
}

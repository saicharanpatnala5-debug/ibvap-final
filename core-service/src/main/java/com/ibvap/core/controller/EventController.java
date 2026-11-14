package com.ibvap.core.controller;

import com.ibvap.core.model.AlertIncident;
import com.ibvap.core.model.VehicleRecord;
import com.ibvap.core.service.AlertService;
import com.ibvap.core.service.AuditService;
import com.ibvap.core.service.VehicleRegistryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/events")
public class EventController {
    private final AlertService alertService;
    private final VehicleRegistryService vehicleService;
    private final AuditService auditService;

    public EventController(AlertService alertService, VehicleRegistryService vehicleService, AuditService auditService) {
        this.alertService = alertService;
        this.vehicleService = vehicleService;
        this.auditService = auditService;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> ingestEvent(@RequestBody Map<String, Object> event) {
        String cameraId = (String) event.getOrDefault("cameraId", "sim-cam");
        String cameraName = (String) event.getOrDefault("cameraName", "Simulated Camera");
        String eventType = (String) event.getOrDefault("eventType", "TELEMETRY");

        @SuppressWarnings("unchecked")
        Map<String, Object> entity = (Map<String, Object>) event.get("entity");

        if (entity != null) {
            String plate = (String) entity.get("anprPlate");
            if (plate != null && !plate.isBlank()) {
                VehicleRecord obs = new VehicleRecord();
                obs.setPlateNumber(plate);
                obs.setCameraId(cameraId);
                obs.setCameraName(cameraName);
                obs.setConfidence(0.90);
                vehicleService.recordObservation(obs);
            }

            String objClass = (String) entity.getOrDefault("class", "object");
            if ("person".equalsIgnoreCase(objClass) && eventType.toLowerCase().contains("breach")) {
                AlertIncident alert = new AlertIncident(
                        null,
                        cameraId,
                        cameraName,
                        "HIGH",
                        "PERIMETER_BREACH",
                        "Entity breach event detected by " + cameraName
                );
                alertService.createAlert(alert);
            }
        }

        auditService.log("simulator", "INGEST_EVENT", "CAMERA", cameraId, Map.of("eventType", eventType));

        return ResponseEntity.ok(Map.of(
                "status", "ingested",
                "cameraId", cameraId,
                "timestamp", System.currentTimeMillis()
        ));
    }
}

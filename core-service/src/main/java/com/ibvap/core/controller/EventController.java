package com.ibvap.core.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ibvap.core.model.AlertIncident;
import com.ibvap.core.model.Event;
import com.ibvap.core.model.VehicleRecord;
import com.ibvap.core.service.AlertService;
import com.ibvap.core.service.AuditService;
import com.ibvap.core.service.IncidentService;
import com.ibvap.core.service.VehicleRegistryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping({"/api/events", "/internal/events"})
public class EventController {
    private final AlertService alertService;
    private final VehicleRegistryService vehicleService;
    private final IncidentService incidentService;
    private final AuditService auditService;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired(required = false)
    public EventController(AlertService alertService, VehicleRegistryService vehicleService, IncidentService incidentService, AuditService auditService) {
        this.alertService = alertService;
        this.vehicleService = vehicleService;
        this.incidentService = incidentService;
        this.auditService = auditService;
    }

    public EventController(AlertService alertService, VehicleRegistryService vehicleService, AuditService auditService) {
        this(alertService, vehicleService, null, auditService);
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> ingestEvent(@RequestBody Map<String, Object> eventMap) {
        String cameraId = (String) eventMap.getOrDefault("cameraId", "sim-cam");
        String cameraName = (String) eventMap.getOrDefault("cameraName", "Simulated Camera");
        String eventType = (String) eventMap.getOrDefault("eventType", "TELEMETRY");

        @SuppressWarnings("unchecked")
        Map<String, Object> entity = (Map<String, Object>) eventMap.get("entity");

        Event event = new Event();
        event.setId(UUID.randomUUID().toString());
        event.setCameraId(cameraId);
        event.setCameraName(cameraName);
        event.setEventType(eventType);
        event.setTimestamp(Instant.now());

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
            event.setObjectClass(objClass);

            Object trackIdObj = entity.get("trackId");
            if (trackIdObj instanceof Number) {
                event.setTrackId(((Number) trackIdObj).longValue());
            }

            try {
                event.setDetailsJson(MAPPER.writeValueAsString(entity));
            } catch (Exception ignored) {}

            boolean isBreachOrIntrusion = eventType.toLowerCase().contains("breach") ||
                    eventType.toLowerCase().contains("intrusion") ||
                    eventType.toLowerCase().contains("loiter");

            if (isBreachOrIntrusion) {
                AlertIncident alert = new AlertIncident(
                        null,
                        cameraId,
                        cameraName,
                        "HIGH",
                        eventType.toUpperCase(),
                        "Entity " + objClass + " triggered " + eventType + " on " + cameraName
                );
                alertService.createAlert(alert);

                if (incidentService != null) {
                    incidentService.fuseEvent(event);
                }
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

package com.ibvap.core.controller;

import com.ibvap.core.model.Event;
import com.ibvap.core.model.Incident;
import com.ibvap.core.service.IncidentService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/incidents")
public class IncidentController {
    private final IncidentService incidentService;

    public IncidentController(IncidentService incidentService) {
        this.incidentService = incidentService;
    }

    @GetMapping
    public ResponseEntity<List<Incident>> getIncidents(@RequestParam(required = false) String status) {
        if (status != null && !status.isBlank()) {
            return ResponseEntity.ok(incidentService.getByStatus(status));
        }
        return ResponseEntity.ok(incidentService.getAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getIncident(@PathVariable String id) {
        return incidentService.getById(id)
                .map(incident -> {
                    List<Event> events = incidentService.getEventsForIncident(id);
                    return ResponseEntity.ok(Map.of(
                            "incident", incident,
                            "events", events
                    ));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<Incident> createIncident(@RequestBody Incident incident) {
        return ResponseEntity.ok(incidentService.createIncident(incident));
    }

    @PostMapping("/{id}/acknowledge")
    public ResponseEntity<?> acknowledgeIncident(@PathVariable String id, @RequestBody(required = false) Map<String, String> body) {
        String operator = (body != null && body.containsKey("operator")) ? body.get("operator") : "operator";
        return incidentService.acknowledgeIncident(id, operator)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/escalate")
    public ResponseEntity<?> escalateIncident(@PathVariable String id, @RequestBody(required = false) Map<String, String> body) {
        String operator = (body != null && body.containsKey("operator")) ? body.get("operator") : "operator";
        String notes = (body != null) ? body.get("notes") : "";
        return incidentService.escalateIncident(id, operator, notes)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/close")
    public ResponseEntity<?> closeIncident(@PathVariable String id, @RequestBody(required = false) Map<String, String> body) {
        String operator = (body != null && body.containsKey("operator")) ? body.get("operator") : "operator";
        String notes = (body != null) ? body.get("notes") : "";
        return incidentService.closeIncident(id, operator, notes)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}

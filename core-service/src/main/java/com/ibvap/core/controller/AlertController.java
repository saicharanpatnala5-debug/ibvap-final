package com.ibvap.core.controller;

import com.ibvap.core.model.AlertIncident;
import com.ibvap.core.service.AlertService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

@RestController
@RequestMapping("/api/alerts")
public class AlertController {
    private final AlertService alertService;

    public AlertController(AlertService alertService) {
        this.alertService = alertService;
    }

    @GetMapping
    public ResponseEntity<List<AlertIncident>> getAlerts(@RequestParam(required = false, defaultValue = "false") boolean openOnly) {
        if (openOnly) {
            return ResponseEntity.ok(alertService.getOpenAlerts());
        }
        return ResponseEntity.ok(alertService.getAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<AlertIncident> getAlert(@PathVariable String id) {
        return alertService.getById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<AlertIncident> createAlert(@RequestBody AlertIncident alert) {
        AlertIncident created = alertService.createAlert(alert);
        return ResponseEntity.ok(created);
    }

    @PutMapping("/{id}/acknowledge")
    public ResponseEntity<AlertIncident> acknowledgeAlert(
            @PathVariable String id,
            @RequestParam(required = false, defaultValue = "operator") String operator) {
        return alertService.acknowledgeAlert(id, operator)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}/resolve")
    public ResponseEntity<AlertIncident> resolveAlert(
            @PathVariable String id,
            @RequestParam(required = false, defaultValue = "operator") String operator) {
        return alertService.resolveAlert(id, operator)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamAlerts() {
        return alertService.subscribe();
    }
}

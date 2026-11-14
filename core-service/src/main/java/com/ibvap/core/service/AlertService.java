package com.ibvap.core.service;

import com.ibvap.core.model.AlertIncident;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

@Service
public class AlertService {
    private final Map<String, AlertIncident> alerts = new ConcurrentHashMap<>();
    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();
    private final AuditService auditService;

    public AlertService(AuditService auditService) {
        this.auditService = auditService;
    }

    public List<AlertIncident> getAll() {
        return alerts.values().stream()
                .sorted(Comparator.comparing(AlertIncident::getTimestamp).reversed())
                .collect(Collectors.toList());
    }

    public List<AlertIncident> getOpenAlerts() {
        return alerts.values().stream()
                .filter(a -> "OPEN".equalsIgnoreCase(a.getStatus()))
                .sorted(Comparator.comparing(AlertIncident::getTimestamp).reversed())
                .collect(Collectors.toList());
    }

    public Optional<AlertIncident> getById(String id) {
        return Optional.ofNullable(alerts.get(id));
    }

    public AlertIncident createAlert(AlertIncident alert) {
        if (alert.getId() == null || alert.getId().trim().isEmpty()) {
            alert.setId(UUID.randomUUID().toString());
        }
        if (alert.getTimestamp() == null) {
            alert.setTimestamp(Instant.now());
        }
        if (alert.getStatus() == null) {
            alert.setStatus("OPEN");
        }
        alerts.put(alert.getId(), alert);

        auditService.log("system", "ALERT_TRIGGERED", "ALERT", alert.getId(),
                Map.of("severity", alert.getSeverity(), "type", alert.getType(), "cameraId", alert.getCameraId() != null ? alert.getCameraId() : ""));

        // Push real-time event to SSE subscribers
        pushToSubscribers(alert);
        return alert;
    }

    public Optional<AlertIncident> acknowledgeAlert(String id, String operator) {
        AlertIncident alert = alerts.get(id);
        if (alert == null) return Optional.empty();
        alert.setStatus("ACKNOWLEDGED");
        auditService.log(operator != null ? operator : "operator", "ACKNOWLEDGE", "ALERT", id,
                Map.of("status", "ACKNOWLEDGED"));
        pushToSubscribers(alert);
        return Optional.of(alert);
    }

    public Optional<AlertIncident> resolveAlert(String id, String operator) {
        AlertIncident alert = alerts.get(id);
        if (alert == null) return Optional.empty();
        alert.setStatus("RESOLVED");
        auditService.log(operator != null ? operator : "operator", "RESOLVE", "ALERT", id,
                Map.of("status", "RESOLVED"));
        pushToSubscribers(alert);
        return Optional.of(alert);
    }

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(180_000L); // 3 minutes timeout
        emitters.add(emitter);

        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(e -> emitters.remove(emitter));

        // Send initial connection confirmation
        try {
            emitter.send(SseEmitter.event().name("INIT").data("Connected to IBVAP Alert Stream"));
        } catch (IOException e) {
            emitters.remove(emitter);
        }

        return emitter;
    }

    private void pushToSubscribers(AlertIncident alert) {
        List<SseEmitter> deadEmitters = new ArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                        .name("ALERT")
                        .id(alert.getId())
                        .data(alert));
            } catch (Exception e) {
                deadEmitters.add(emitter);
            }
        }
        emitters.removeAll(deadEmitters);
    }

    public void clear() {
        alerts.clear();
    }
}

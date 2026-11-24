package com.ibvap.core.service;

import com.ibvap.core.model.AlertIncident;
import com.ibvap.core.repository.AlertIncidentRepository;
import org.springframework.beans.factory.annotation.Autowired;
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
    public static final String CURRENT_SCHEMA_VERSION = "v8.0.0";
    public static final String CURRENT_RUN_ID = "r8-release-20261115";

    private final AlertIncidentRepository alertRepository;
    private final AuditService auditService;
    private final Map<String, AlertIncident> fallbackAlerts = new ConcurrentHashMap<>();
    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    @Autowired(required = false)
    public AlertService(AlertIncidentRepository alertRepository, AuditService auditService) {
        this.alertRepository = alertRepository;
        this.auditService = auditService;
    }

    public AlertService(AuditService auditService) {
        this(null, auditService);
    }

    public List<AlertIncident> getAll() {
        if (alertRepository != null) {
            try {
                return alertRepository.findAllByOrderByTimestampDesc().stream()
                        .filter(a -> CURRENT_SCHEMA_VERSION.equals(a.getSchemaVersion()))
                        .collect(Collectors.toList());
            } catch (Exception ignored) {}
        }
        return fallbackAlerts.values().stream()
                .filter(a -> CURRENT_SCHEMA_VERSION.equals(a.getSchemaVersion()))
                .sorted(Comparator.comparing(AlertIncident::getTimestamp).reversed())
                .collect(Collectors.toList());
    }

    public List<AlertIncident> getOpenAlerts() {
        if (alertRepository != null) {
            try {
                return alertRepository.findByStatusOrderByTimestampDesc("OPEN").stream()
                        .filter(a -> CURRENT_SCHEMA_VERSION.equals(a.getSchemaVersion()))
                        .collect(Collectors.toList());
            } catch (Exception ignored) {}
        }
        return fallbackAlerts.values().stream()
                .filter(a -> CURRENT_SCHEMA_VERSION.equals(a.getSchemaVersion()))
                .filter(a -> "OPEN".equalsIgnoreCase(a.getStatus()))
                .sorted(Comparator.comparing(AlertIncident::getTimestamp).reversed())
                .collect(Collectors.toList());
    }

    public Optional<AlertIncident> getById(String id) {
        if (alertRepository != null) {
            try {
                return alertRepository.findById(id)
                        .filter(a -> CURRENT_SCHEMA_VERSION.equals(a.getSchemaVersion()));
            } catch (Exception ignored) {}
        }
        return Optional.ofNullable(fallbackAlerts.get(id))
                .filter(a -> CURRENT_SCHEMA_VERSION.equals(a.getSchemaVersion()));
    }

    public AlertIncident createAlert(AlertIncident alert) {
        if (alert.getSchemaVersion() != null && !CURRENT_SCHEMA_VERSION.equals(alert.getSchemaVersion())) {
            return null;
        }
        alert.setSchemaVersion(CURRENT_SCHEMA_VERSION);
        if (alert.getRunId() == null) {
            alert.setRunId(CURRENT_RUN_ID);
        }
        if (alert.getId() == null || alert.getId().trim().isEmpty()) {
            alert.setId(UUID.randomUUID().toString());
        }
        if (alert.getTimestamp() == null) {
            alert.setTimestamp(Instant.now());
        }
        if (alert.getStatus() == null) {
            alert.setStatus("OPEN");
        }

        if (alertRepository != null) {
            try {
                alert = alertRepository.save(alert);
            } catch (Exception ignored) {
                fallbackAlerts.put(alert.getId(), alert);
            }
        } else {
            fallbackAlerts.put(alert.getId(), alert);
        }

        auditService.log("system", "ALERT_TRIGGERED", "ALERT", alert.getId(),
                Map.of("severity", alert.getSeverity(), "type", alert.getType(), "cameraId", alert.getCameraId() != null ? alert.getCameraId() : ""));

        pushToSubscribers(alert);
        return alert;
    }

    public Optional<AlertIncident> acknowledgeAlert(String id, String operator) {
        Optional<AlertIncident> alertOpt = getById(id);
        if (alertOpt.isEmpty()) return Optional.empty();
        AlertIncident alert = alertOpt.get();
        alert.setStatus("ACKNOWLEDGED");

        if (alertRepository != null) {
            try {
                alert = alertRepository.save(alert);
            } catch (Exception ignored) {
                fallbackAlerts.put(id, alert);
            }
        } else {
            fallbackAlerts.put(id, alert);
        }

        auditService.log(operator != null ? operator : "operator", "ACKNOWLEDGE", "ALERT", id,
                Map.of("status", "ACKNOWLEDGED"));
        pushToSubscribers(alert);
        return Optional.of(alert);
    }

    public Optional<AlertIncident> resolveAlert(String id, String operator) {
        Optional<AlertIncident> alertOpt = getById(id);
        if (alertOpt.isEmpty()) return Optional.empty();
        AlertIncident alert = alertOpt.get();
        alert.setStatus("RESOLVED");

        if (alertRepository != null) {
            try {
                alert = alertRepository.save(alert);
            } catch (Exception ignored) {
                fallbackAlerts.put(id, alert);
            }
        } else {
            fallbackAlerts.put(id, alert);
        }

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
        if (alertRepository != null) {
            try {
                alertRepository.deleteAll();
            } catch (Exception ignored) {}
        }
        fallbackAlerts.clear();
    }
}

package com.ibvap.core.service;

import com.ibvap.core.model.Event;
import com.ibvap.core.model.Incident;
import com.ibvap.core.repository.EventRepository;
import com.ibvap.core.repository.IncidentRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class IncidentService {
    private final IncidentRepository incidentRepository;
    private final EventRepository eventRepository;
    private final AuditService auditService;
    private final Map<String, Incident> fallbackIncidents = new ConcurrentHashMap<>();

    @Autowired(required = false)
    public IncidentService(IncidentRepository incidentRepository, EventRepository eventRepository, AuditService auditService) {
        this.incidentRepository = incidentRepository;
        this.eventRepository = eventRepository;
        this.auditService = auditService;
    }

    public IncidentService(AuditService auditService) {
        this(null, null, auditService);
    }

    public List<Incident> getAll() {
        if (incidentRepository != null) {
            try {
                return incidentRepository.findAllByOrderByStartedAtDesc();
            } catch (Exception ignored) {}
        }
        return fallbackIncidents.values().stream()
                .sorted(Comparator.comparing(Incident::getStartedAt).reversed())
                .collect(Collectors.toList());
    }

    public List<Incident> getByStatus(String status) {
        if (incidentRepository != null) {
            try {
                return incidentRepository.findByStatusOrderByStartedAtDesc(status);
            } catch (Exception ignored) {}
        }
        return fallbackIncidents.values().stream()
                .filter(i -> status == null || status.equalsIgnoreCase(i.getStatus()))
                .sorted(Comparator.comparing(Incident::getStartedAt).reversed())
                .collect(Collectors.toList());
    }

    public Optional<Incident> getById(String id) {
        if (incidentRepository != null) {
            try {
                return incidentRepository.findById(id);
            } catch (Exception ignored) {}
        }
        return Optional.ofNullable(fallbackIncidents.get(id));
    }

    public List<Event> getEventsForIncident(String incidentId) {
        if (eventRepository != null) {
            try {
                return eventRepository.findByIncidentIdOrderByTimestampAsc(incidentId);
            } catch (Exception ignored) {}
        }
        return Collections.emptyList();
    }

    public Incident createIncident(Incident incident) {
        if (incident.getId() == null || incident.getId().trim().isEmpty()) {
            incident.setId(UUID.randomUUID().toString());
        }
        if (incident.getStartedAt() == null) {
            incident.setStartedAt(Instant.now());
        }
        if (incident.getStatus() == null) {
            incident.setStatus("OPEN");
        }

        if (incidentRepository != null) {
            try {
                incident = incidentRepository.save(incident);
            } catch (Exception ignored) {
                fallbackIncidents.put(incident.getId(), incident);
            }
        } else {
            fallbackIncidents.put(incident.getId(), incident);
        }

        auditService.log("system", "INCIDENT_CREATED", "INCIDENT", incident.getId(),
                Map.of("title", incident.getTitle() != null ? incident.getTitle() : "Incident",
                        "severity", incident.getSeverity() != null ? incident.getSeverity() : "MEDIUM",
                        "riskScore", incident.getRiskScore()));

        return incident;
    }

    public Optional<Incident> acknowledgeIncident(String id, String operator) {
        Optional<Incident> opt = getById(id);
        if (opt.isEmpty()) return Optional.empty();
        Incident incident = opt.get();
        incident.setStatus("ACKNOWLEDGED");
        incident.setAcknowledgedBy(operator != null ? operator : "operator");
        incident.setAcknowledgedAt(Instant.now());

        if (incidentRepository != null) {
            try {
                incident = incidentRepository.save(incident);
            } catch (Exception ignored) {
                fallbackIncidents.put(id, incident);
            }
        } else {
            fallbackIncidents.put(id, incident);
        }

        auditService.log(operator != null ? operator : "operator", "ACKNOWLEDGE", "INCIDENT", id,
                Map.of("status", "ACKNOWLEDGED"));
        return Optional.of(incident);
    }

    public Optional<Incident> escalateIncident(String id, String operator, String notes) {
        Optional<Incident> opt = getById(id);
        if (opt.isEmpty()) return Optional.empty();
        Incident incident = opt.get();
        incident.setStatus("ESCALATED");
        incident.setSeverity("CRITICAL");
        incident.setEscalatedBy(operator != null ? operator : "operator");
        incident.setEscalatedAt(Instant.now());
        if (notes != null && !notes.isBlank()) {
            incident.setResolutionNotes(notes);
        }

        if (incidentRepository != null) {
            try {
                incident = incidentRepository.save(incident);
            } catch (Exception ignored) {
                fallbackIncidents.put(id, incident);
            }
        } else {
            fallbackIncidents.put(id, incident);
        }

        auditService.log(operator != null ? operator : "operator", "ESCALATE", "INCIDENT", id,
                Map.of("status", "ESCALATED", "severity", "CRITICAL"));
        return Optional.of(incident);
    }

    public Optional<Incident> closeIncident(String id, String operator, String notes) {
        Optional<Incident> opt = getById(id);
        if (opt.isEmpty()) return Optional.empty();
        Incident incident = opt.get();
        incident.setStatus("CLOSED");
        incident.setClosedBy(operator != null ? operator : "operator");
        incident.setClosedAt(Instant.now());
        incident.setEndedAt(Instant.now());
        if (notes != null && !notes.isBlank()) {
            incident.setResolutionNotes(notes);
        }

        if (incidentRepository != null) {
            try {
                incident = incidentRepository.save(incident);
            } catch (Exception ignored) {
                fallbackIncidents.put(id, incident);
            }
        } else {
            fallbackIncidents.put(id, incident);
        }

        auditService.log(operator != null ? operator : "operator", "CLOSE", "INCIDENT", id,
                Map.of("status", "CLOSED", "resolution", notes != null ? notes : "Resolved"));
        return Optional.of(incident);
    }

    /**
     * Event fusion: if an open incident exists on the same camera/track within 60s, fuse into it;
     * otherwise create a new incident.
     */
    public Incident fuseEvent(Event event) {
        Event effectiveEvent = event;
        if (eventRepository != null) {
            try {
                effectiveEvent = eventRepository.save(event);
            } catch (Exception ignored) {}
        }
        final Event finalEvent = effectiveEvent;

        // Look for open incident on same camera within 60s
        Instant cutoff = Instant.now().minusSeconds(60);
        List<Incident> openOnCam = getAll().stream()
                .filter(i -> "OPEN".equalsIgnoreCase(i.getStatus()))
                .filter(i -> Objects.equals(i.getCameraId(), finalEvent.getCameraId()))
                .filter(i -> i.getStartedAt() != null && i.getStartedAt().isAfter(cutoff))
                .collect(Collectors.toList());

        if (!openOnCam.isEmpty()) {
            Incident target = openOnCam.get(0);
            List<String> eventIds = new ArrayList<>(target.getEventIds());
            if (!eventIds.contains(finalEvent.getId())) {
                eventIds.add(finalEvent.getId());
                target.setEventIds(eventIds);
            }
            target.setEndedAt(Instant.now());

            // Add contributing factor
            List<String> factors = new ArrayList<>(target.getContributingFactors());
            String factorDesc = finalEvent.getEventType() + " (" + (finalEvent.getObjectClass() != null ? finalEvent.getObjectClass() : "entity") + ")";
            if (!factors.contains(factorDesc)) {
                factors.add(factorDesc);
                target.setContributingFactors(factors);
                // Increase risk score proportionally up to 100
                target.setRiskScore(Math.min(100.0, target.getRiskScore() + 15.0));
                if (target.getRiskScore() >= 80.0) {
                    target.setSeverity("CRITICAL");
                } else if (target.getRiskScore() >= 60.0) {
                    target.setSeverity("HIGH");
                }
            }

            if (incidentRepository != null) {
                try {
                    target = incidentRepository.save(target);
                } catch (Exception ignored) {}
            }
            return target;
        }

        // Create new incident
        Incident newInc = new Incident();
        newInc.setCameraId(finalEvent.getCameraId());
        newInc.setCameraName(finalEvent.getCameraName());
        newInc.setTitle(finalEvent.getEventType() + " - " + (finalEvent.getObjectClass() != null ? finalEvent.getObjectClass() : "Entity"));
        newInc.setDescription("Detected " + finalEvent.getEventType() + " event on " + finalEvent.getCameraName());
        newInc.setPrimaryEntity(finalEvent.getObjectClass() + (finalEvent.getTrackId() != null ? " #" + finalEvent.getTrackId() : ""));
        newInc.setRiskScore(50.0);
        newInc.setSeverity("HIGH");
        newInc.setEventIds(List.of(finalEvent.getId()));
        newInc.setContributingFactors(List.of(finalEvent.getEventType()));
        return createIncident(newInc);
    }

    public void clear() {
        if (eventRepository != null) {
            try {
                eventRepository.deleteAll();
            } catch (Exception ignored) {}
        }
        if (incidentRepository != null) {
            try {
                incidentRepository.deleteAll();
            } catch (Exception ignored) {}
        }
        fallbackIncidents.clear();
    }
}

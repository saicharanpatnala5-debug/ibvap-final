package com.ibvap.core.controller;

import com.ibvap.core.model.Event;
import com.ibvap.core.model.Incident;
import com.ibvap.core.model.VehicleRecord;
import com.ibvap.core.repository.EventRepository;
import com.ibvap.core.service.IncidentService;
import com.ibvap.core.service.VehicleRegistryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/search")
public class SearchController {
    private final EventRepository eventRepository;
    private final IncidentService incidentService;
    private final VehicleRegistryService vehicleService;

    @Autowired(required = false)
    public SearchController(EventRepository eventRepository, IncidentService incidentService, VehicleRegistryService vehicleService) {
        this.eventRepository = eventRepository;
        this.incidentService = incidentService;
        this.vehicleService = vehicleService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> search(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String cameraId,
            @RequestParam(required = false) String objectClass,
            @RequestParam(required = false) String plate) {

        List<VehicleRecord> sightings = Collections.emptyList();
        if (vehicleService != null) {
            sightings = vehicleService.getAllObserved().stream()
                    .filter(v -> plate == null || (v.getNormalizedPlate() != null && v.getNormalizedPlate().contains(VehicleRegistryService.normalize(plate))))
                    .filter(v -> cameraId == null || Objects.equals(v.getCameraId(), cameraId))
                    .collect(Collectors.toList());
        }

        List<Incident> incidents = Collections.emptyList();
        if (incidentService != null) {
            incidents = incidentService.getAll().stream()
                    .filter(i -> cameraId == null || Objects.equals(i.getCameraId(), cameraId))
                    .filter(i -> query == null || (i.getTitle() != null && i.getTitle().toLowerCase().contains(query.toLowerCase())))
                    .collect(Collectors.toList());
        }

        List<Event> events = Collections.emptyList();
        if (eventRepository != null) {
            try {
                events = eventRepository.findAllByOrderByTimestampDesc().stream()
                        .filter(e -> cameraId == null || Objects.equals(e.getCameraId(), cameraId))
                        .filter(e -> objectClass == null || (e.getObjectClass() != null && e.getObjectClass().equalsIgnoreCase(objectClass)))
                        .limit(50)
                        .collect(Collectors.toList());
            } catch (Exception ignored) {}
        }

        return ResponseEntity.ok(Map.of(
                "query", query != null ? query : "",
                "sightings", sightings,
                "incidents", incidents,
                "events", events,
                "totalSightings", sightings.size(),
                "totalIncidents", incidents.size(),
                "totalEvents", events.size()
        ));
    }
}

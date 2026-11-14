package com.ibvap.core.service;

import com.ibvap.core.model.VirtualZone;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class ZoneService {
    private final Map<String, VirtualZone> zones = new ConcurrentHashMap<>();
    private final AuditService auditService;

    public ZoneService(AuditService auditService) {
        this.auditService = auditService;
    }

    public List<VirtualZone> getAll() {
        return new ArrayList<>(zones.values());
    }

    public List<VirtualZone> getByCameraId(String cameraId) {
        return zones.values().stream()
                .filter(z -> Objects.equals(z.getCameraId(), cameraId))
                .collect(Collectors.toList());
    }

    public Optional<VirtualZone> getById(String id) {
        return Optional.ofNullable(zones.get(id));
    }

    public VirtualZone addZone(VirtualZone zone) {
        if (zone.getId() == null || zone.getId().trim().isEmpty()) {
            zone.setId(UUID.randomUUID().toString());
        }
        zones.put(zone.getId(), zone);
        auditService.log("operator", "CREATE", "ZONE", zone.getId(),
                Map.of("name", zone.getName() != null ? zone.getName() : "Zone",
                       "type", zone.getType() != null ? zone.getType() : "RESTRICTED",
                       "cameraId", zone.getCameraId() != null ? zone.getCameraId() : ""));
        return zone;
    }

    public Optional<VirtualZone> updateZone(String id, VirtualZone updated) {
        VirtualZone existing = zones.get(id);
        if (existing == null) return Optional.empty();
        if (updated.getName() != null) existing.setName(updated.getName());
        if (updated.getType() != null) existing.setType(updated.getType());
        if (updated.getPolygon() != null) existing.setPolygon(updated.getPolygon());
        if (updated.getColor() != null) existing.setColor(updated.getColor());
        existing.setActive(updated.isActive());

        auditService.log("operator", "UPDATE", "ZONE", id, Map.of("name", existing.getName(), "active", existing.isActive()));
        return Optional.of(existing);
    }

    public boolean deleteZone(String id) {
        VirtualZone removed = zones.remove(id);
        if (removed != null) {
            auditService.log("operator", "DELETE", "ZONE", id, Map.of("name", removed.getName()));
            return true;
        }
        return false;
    }

    public void clear() {
        zones.clear();
    }
}

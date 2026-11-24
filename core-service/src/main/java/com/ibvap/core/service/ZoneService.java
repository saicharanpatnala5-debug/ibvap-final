package com.ibvap.core.service;

import com.ibvap.core.model.VirtualZone;
import com.ibvap.core.repository.VirtualZoneRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class ZoneService {
    private final VirtualZoneRepository zoneRepository;
    private final AuditService auditService;
    private final Map<String, VirtualZone> fallbackZones = new ConcurrentHashMap<>();

    @Autowired(required = false)
    public ZoneService(VirtualZoneRepository zoneRepository, AuditService auditService) {
        this.zoneRepository = zoneRepository;
        this.auditService = auditService;
    }

    public ZoneService(AuditService auditService) {
        this(null, auditService);
    }

    public List<VirtualZone> getAll() {
        if (zoneRepository != null) {
            try {
                return zoneRepository.findAll();
            } catch (Exception ignored) {}
        }
        return new ArrayList<>(fallbackZones.values());
    }

    public List<VirtualZone> getByCameraId(String cameraId) {
        if (zoneRepository != null) {
            try {
                return zoneRepository.findByCameraId(cameraId);
            } catch (Exception ignored) {}
        }
        return fallbackZones.values().stream()
                .filter(z -> Objects.equals(z.getCameraId(), cameraId))
                .collect(Collectors.toList());
    }

    public Optional<VirtualZone> getById(String id) {
        if (zoneRepository != null) {
            try {
                return zoneRepository.findById(id);
            } catch (Exception ignored) {}
        }
        return Optional.ofNullable(fallbackZones.get(id));
    }

    public VirtualZone addZone(VirtualZone zone) {
        if (zone.getId() == null || zone.getId().trim().isEmpty()) {
            zone.setId(UUID.randomUUID().toString());
        }

        if (zoneRepository != null) {
            try {
                zone = zoneRepository.save(zone);
            } catch (Exception ignored) {
                fallbackZones.put(zone.getId(), zone);
            }
        } else {
            fallbackZones.put(zone.getId(), zone);
        }

        auditService.log("operator", "CREATE", "ZONE", zone.getId(),
                Map.of("name", zone.getName() != null ? zone.getName() : "Zone",
                       "type", zone.getType() != null ? zone.getType() : "RESTRICTED",
                       "cameraId", zone.getCameraId() != null ? zone.getCameraId() : ""));
        return zone;
    }

    public Optional<VirtualZone> updateZone(String id, VirtualZone updated) {
        Optional<VirtualZone> existingOpt = getById(id);
        if (existingOpt.isEmpty()) return Optional.empty();
        VirtualZone existing = existingOpt.get();
        if (updated.getName() != null) existing.setName(updated.getName());
        if (updated.getType() != null) existing.setType(updated.getType());
        if (updated.getPolygon() != null) existing.setPolygon(updated.getPolygon());
        if (updated.getColor() != null) existing.setColor(updated.getColor());
        existing.setActive(updated.isActive());

        if (zoneRepository != null) {
            try {
                existing = zoneRepository.save(existing);
            } catch (Exception ignored) {
                fallbackZones.put(id, existing);
            }
        } else {
            fallbackZones.put(id, existing);
        }

        auditService.log("operator", "UPDATE", "ZONE", id, Map.of("name", existing.getName(), "active", existing.isActive()));
        return Optional.of(existing);
    }

    public boolean deleteZone(String id) {
        Optional<VirtualZone> existing = getById(id);
        if (existing.isPresent()) {
            if (zoneRepository != null) {
                try {
                    zoneRepository.deleteById(id);
                } catch (Exception ignored) {
                    fallbackZones.remove(id);
                }
            } else {
                fallbackZones.remove(id);
            }
            auditService.log("operator", "DELETE", "ZONE", id, Map.of("name", existing.get().getName()));
            return true;
        }
        return false;
    }

    public void clear() {
        if (zoneRepository != null) {
            try {
                zoneRepository.deleteAll();
            } catch (Exception ignored) {}
        }
        fallbackZones.clear();
    }
}

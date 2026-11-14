package com.ibvap.core.controller;

import com.ibvap.core.model.VirtualZone;
import com.ibvap.core.service.ZoneService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/zones")
public class ZoneController {
    private final ZoneService zoneService;

    public ZoneController(ZoneService zoneService) {
        this.zoneService = zoneService;
    }

    @GetMapping
    public ResponseEntity<List<VirtualZone>> getZones(@RequestParam(required = false) String cameraId) {
        if (cameraId != null && !cameraId.isBlank()) {
            return ResponseEntity.ok(zoneService.getByCameraId(cameraId));
        }
        return ResponseEntity.ok(zoneService.getAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<VirtualZone> getZone(@PathVariable String id) {
        return zoneService.getById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<VirtualZone> createZone(@RequestBody VirtualZone zone) {
        VirtualZone created = zoneService.addZone(zone);
        return ResponseEntity.ok(created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<VirtualZone> updateZone(@PathVariable String id, @RequestBody VirtualZone zone) {
        return zoneService.updateZone(id, zone)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteZone(@PathVariable String id) {
        if (zoneService.deleteZone(id)) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.notFound().build();
    }
}

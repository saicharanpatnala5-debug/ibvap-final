package com.ibvap.core.controller;

import com.ibvap.core.model.Camera;
import com.ibvap.core.service.CameraService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/cameras")
public class CameraController {
    private final CameraService cameraService;
    private final com.ibvap.core.service.ZoneService zoneService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public CameraController(CameraService cameraService, com.ibvap.core.service.ZoneService zoneService) {
        this.cameraService = cameraService;
        this.zoneService = zoneService;
    }

    public CameraController(CameraService cameraService) {
        this(cameraService, null);
    }

    @GetMapping
    public ResponseEntity<List<Camera>> getCameras() {
        return ResponseEntity.ok(cameraService.getAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Camera> getCamera(@PathVariable String id) {
        return cameraService.getById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/zones")
    public ResponseEntity<List<com.ibvap.core.model.VirtualZone>> getCameraZones(@PathVariable String id) {
        if (zoneService != null) {
            return ResponseEntity.ok(zoneService.getByCameraId(id));
        }
        return ResponseEntity.ok(List.of());
    }

    @PostMapping
    public ResponseEntity<Camera> createCamera(@RequestBody Camera camera) {
        Camera created = cameraService.addCamera(camera);
        return ResponseEntity.ok(created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Camera> updateCamera(@PathVariable String id, @RequestBody Camera updated) {
        return cameraService.updateCamera(id, updated)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteCamera(@PathVariable String id) {
        if (cameraService.deleteCamera(id)) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.notFound().build();
    }
}

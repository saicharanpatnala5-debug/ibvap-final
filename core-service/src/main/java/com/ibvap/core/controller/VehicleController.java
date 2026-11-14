package com.ibvap.core.controller;

import com.ibvap.core.model.VehicleRecord;
import com.ibvap.core.service.VehicleRegistryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/vehicles")
public class VehicleController {
    private final VehicleRegistryService vehicleService;

    public VehicleController(VehicleRegistryService vehicleService) {
        this.vehicleService = vehicleService;
    }

    @GetMapping
    public ResponseEntity<List<VehicleRecord>> getObservedVehicles() {
        return ResponseEntity.ok(vehicleService.getAllObserved());
    }

    @GetMapping("/{plate}")
    public ResponseEntity<VehicleRecord> getVehicle(@PathVariable String plate) {
        return vehicleService.getObservedByPlate(plate)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<VehicleRecord> recordObservation(@RequestBody VehicleRecord observation) {
        VehicleRecord recorded = vehicleService.recordObservation(observation);
        return ResponseEntity.ok(recorded);
    }

    @PostMapping("/lookup")
    public ResponseEntity<VehicleRecord> lookupRegistry(@RequestBody Map<String, String> body) {
        String plate = body.get("plate");
        if (plate == null || plate.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return vehicleService.lookupRegistry(plate)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{plate}/correct")
    public ResponseEntity<VehicleRecord> correctPlate(
            @PathVariable String plate,
            @RequestBody Map<String, String> body) {
        String corrected = body.get("correctedPlate");
        String operator = body.getOrDefault("operator", "operator");
        if (corrected == null || corrected.isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        return vehicleService.correctPlate(plate, corrected, operator)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}

package com.ibvap.core.controller;

import com.ibvap.core.model.AlertIncident;
import com.ibvap.core.model.Camera;
import com.ibvap.core.model.VehicleRecord;
import com.ibvap.core.model.VirtualZone;
import com.ibvap.core.service.AlertService;
import com.ibvap.core.service.CameraService;
import com.ibvap.core.service.VehicleRegistryService;
import com.ibvap.core.service.ZoneService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/demo")
public class DemoController {
    private final CameraService cameraService;
    private final ZoneService zoneService;
    private final AlertService alertService;
    private final VehicleRegistryService vehicleService;

    public DemoController(CameraService cameraService, ZoneService zoneService, AlertService alertService, VehicleRegistryService vehicleService) {
        this.cameraService = cameraService;
        this.zoneService = zoneService;
        this.alertService = alertService;
        this.vehicleService = vehicleService;
    }

    @PostMapping("/load")
    public ResponseEntity<Map<String, Object>> loadDemoData() {
        // Clear first
        clearData();

        // 1. Demo Cameras (explicitly labeled [Demo])
        Camera cam1 = new Camera("cam-demo-north", "[Demo] Sector 4 Perimeter North", "North Watchtower", "/demo-samples/night_perimeter_motion.mp4");
        Camera cam2 = new Camera("cam-demo-checkpoint", "[Demo] Border Checkpoint Alpha", "Main Gate", "/demo-samples/crossing_paths_occlusion.mp4");
        cameraService.addCamera(cam1);
        cameraService.addCamera(cam2);

        // 2. Demo Virtual Zones
        VirtualZone zone1 = new VirtualZone("zone-demo-1", "cam-demo-north", "[Demo] Buffer Strip Alpha", "RESTRICTED",
                List.of(new VirtualZone.Point2D(0.1, 0.6), new VirtualZone.Point2D(0.9, 0.6), new VirtualZone.Point2D(0.9, 0.95), new VirtualZone.Point2D(0.1, 0.95)));
        zoneService.addZone(zone1);

        // 3. Demo Alerts
        AlertIncident alert1 = new AlertIncident("alert-demo-1", "cam-demo-north", "[Demo] Sector 4 Perimeter North", "HIGH", "ZONE_BREACH", "[Demo] Entity crossed perimeter buffer line");
        alertService.createAlert(alert1);

        // 4. Seed Known Reference Registry
        VehicleRecord reg1 = new VehicleRecord("DL01AB1234", "VERIFIED", "Rajesh Sharma", "Delhi", "SEDAN", "Maruti", "Swift");
        VehicleRecord reg2 = new VehicleRecord("HR26DK8337", "WATCHLIST", "Inter-State Transport Corp", "Haryana", "COMMERCIAL", "Tata", "407");
        vehicleService.registerKnownVehicle(reg1);
        vehicleService.registerKnownVehicle(reg2);

        // Record 1 Demo Observation
        VehicleRecord obs = new VehicleRecord("DL01AB1234", "VERIFIED", "Rajesh Sharma", "Delhi", "SEDAN", "Maruti", "Swift");
        obs.setCameraId("cam-demo-checkpoint");
        obs.setCameraName("[Demo] Border Checkpoint Alpha");
        obs.setConfidence(0.94);
        vehicleService.recordObservation(obs);

        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "message", "Demo data loaded successfully (labeled [Demo])",
                "cameras", 2,
                "zones", 1,
                "alerts", 1,
                "vehicles", 1
        ));
    }

    @PostMapping("/clear")
    public ResponseEntity<Map<String, Object>> clearData() {
        cameraService.clear();
        zoneService.clear();
        alertService.clear();
        vehicleService.clear();
        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "message", "All data cleared successfully. System returned to pristine empty state."
        ));
    }
}

package com.ibvap.core.controller;

import com.ibvap.core.model.AlertIncident;
import com.ibvap.core.model.Camera;
import com.ibvap.core.model.Incident;
import com.ibvap.core.model.VehicleRecord;
import com.ibvap.core.model.VirtualZone;
import com.ibvap.core.service.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/demo")
public class DemoController {
    private final CameraService cameraService;
    private final ZoneService zoneService;
    private final AlertService alertService;
    private final VehicleRegistryService vehicleService;
    private final IncidentService incidentService;
    private final AuditService auditService;

    @Autowired(required = false)
    public DemoController(CameraService cameraService, ZoneService zoneService, AlertService alertService,
                          VehicleRegistryService vehicleService, IncidentService incidentService, AuditService auditService) {
        this.cameraService = cameraService;
        this.zoneService = zoneService;
        this.alertService = alertService;
        this.vehicleService = vehicleService;
        this.incidentService = incidentService;
        this.auditService = auditService;
    }

    public DemoController(CameraService cameraService, ZoneService zoneService, AlertService alertService, VehicleRegistryService vehicleService) {
        this(cameraService, zoneService, alertService, vehicleService, null, new AuditService());
    }

    @PostMapping("/load")
    public ResponseEntity<Map<String, Object>> loadDemoData(@RequestParam(required = false) String operator) {
        clearDataInternal();

        // 1. Demo Cameras (explicitly labeled [Demo])
        Camera cam1 = new Camera("cam-demo-north", "[Demo] Sector 4 Perimeter North", "North Watchtower", "/demo-samples/night_perimeter_motion.mp4");
        Camera cam2 = new Camera("cam-demo-checkpoint", "[Demo] Border Checkpoint Alpha", "Main Gate", "/demo-samples/crossing_paths_occlusion.mp4");
        cameraService.addCamera(cam1);
        cameraService.addCamera(cam2);

        // 2. Demo Virtual Zones
        VirtualZone zone1 = new VirtualZone("zone-demo-1", "cam-demo-north", "[Demo] Buffer Strip Alpha", "RESTRICTED",
                List.of(new VirtualZone.Point2D(0.1, 0.6), new VirtualZone.Point2D(0.9, 0.6), new VirtualZone.Point2D(0.9, 0.95), new VirtualZone.Point2D(0.1, 0.95)));
        zoneService.addZone(zone1);

        // 3. Demo Alerts & Incidents
        AlertIncident alert1 = new AlertIncident("alert-demo-1", "cam-demo-north", "[Demo] Sector 4 Perimeter North", "HIGH", "ZONE_BREACH", "[Demo] Entity crossed perimeter buffer line");
        alertService.createAlert(alert1);

        if (incidentService != null) {
            Incident inc1 = new Incident();
            inc1.setId("inc-demo-1");
            inc1.setIncidentNumber("INC-DEMO-001");
            inc1.setCameraId("cam-demo-north");
            inc1.setCameraName("[Demo] Sector 4 Perimeter North");
            inc1.setTitle("[Demo] Perimeter Breach - Person Detected");
            inc1.setDescription("[Demo] Intrusion confirmed in restricted buffer zone with 4s loiter");
            inc1.setPrimaryEntity("Person #101");
            inc1.setSeverity("HIGH");
            inc1.setRiskScore(75.0);
            inc1.setContributingFactors(List.of("INTRUSION (+30)", "NIGHT_ACTIVITY (+15)", "LOITERING (+15)", "INWARD_MOTION (+15)"));
            incidentService.createIncident(inc1);
        }

        // 4. Seed Known Reference Registry (using standard mock plates, never real user plates)
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

        auditService.log(operator != null ? operator : "admin", "LOAD_DEMO_DATA", "SYSTEM", "demo",
                Map.of("message", "Demo data explicitly loaded by operator"));

        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "message", "Demo data loaded successfully (labeled [Demo])",
                "cameras", 2,
                "zones", 1,
                "alerts", 1,
                "incidents", 1,
                "vehicles", 1
        ));
    }

    private void clearDataInternal() {
        cameraService.clear();
        zoneService.clear();
        alertService.clear();
        vehicleService.clear();
        if (incidentService != null) {
            incidentService.clear();
        }
    }

    @PostMapping("/clear")
    public ResponseEntity<Map<String, Object>> clearData(@RequestBody(required = false) Map<String, String> body) {
        String actor = (body != null && body.containsKey("operator")) ? body.get("operator") : "admin";
        clearDataInternal();
        auditService.log(actor, "RESET_SYSTEM", "SYSTEM", "all",
                Map.of("action", "SYSTEM_RESET", "status", "pristine_empty"));

        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "message", "All data cleared successfully. System returned to pristine empty state."
        ));
    }
}

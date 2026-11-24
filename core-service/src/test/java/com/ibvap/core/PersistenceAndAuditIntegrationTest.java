package com.ibvap.core;

import com.ibvap.core.controller.DemoController;
import com.ibvap.core.model.*;
import com.ibvap.core.repository.*;
import com.ibvap.core.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class PersistenceAndAuditIntegrationTest {

    @Autowired
    private CameraRepository cameraRepository;

    @Autowired
    private VirtualZoneRepository zoneRepository;

    @Autowired
    private VehicleRecordRepository vehicleRepository;

    @Autowired
    private AlertIncidentRepository alertRepository;

    @Autowired
    private IncidentRepository incidentRepository;

    @Autowired
    private AuditEntryRepository auditRepository;

    @Autowired
    private CameraService cameraService;

    @Autowired
    private ZoneService zoneService;

    @Autowired
    private AlertService alertService;

    @Autowired
    private VehicleRegistryService vehicleService;

    @Autowired
    private IncidentService incidentService;

    @Autowired
    private DemoController demoController;

    @Test
    void testEntitiesPersistedInDatabase() {
        // 1. Add Camera
        Camera cam = new Camera("cam-persist-1", "North Tower Cam", "North Fence", "rtsp://localhost/cam1");
        cameraService.addCamera(cam);

        assertTrue(cameraRepository.findById("cam-persist-1").isPresent(), "Camera must be persisted in database");

        // 2. Add VirtualZone with polygon
        VirtualZone zone = new VirtualZone("zone-persist-1", "cam-persist-1", "Restricted Line", "RESTRICTED",
                List.of(new VirtualZone.Point2D(0.2, 0.4), new VirtualZone.Point2D(0.8, 0.4)));
        zoneService.addZone(zone);

        assertTrue(zoneRepository.findById("zone-persist-1").isPresent(), "Zone must be persisted in database");
        VirtualZone loadedZone = zoneRepository.findById("zone-persist-1").get();
        assertEquals(2, loadedZone.getPolygon().size(), "Polygon coordinates must be preserved in database");

        // 3. Add Vehicle Sighting
        VehicleRecord rec = new VehicleRecord();
        rec.setPlateNumber("DL01AB1234");
        rec.setCameraId("cam-persist-1");
        rec.setConfidence(0.95);
        vehicleService.recordObservation(rec);

        List<VehicleRecord> obs = vehicleRepository.findByNormalizedPlate("DL01AB1234");
        assertFalse(obs.isEmpty(), "Vehicle sighting must be persisted in database");

        // 4. Add Alert
        AlertIncident alert = new AlertIncident("alert-persist-1", "cam-persist-1", "North Tower Cam", "HIGH", "ZONE_BREACH", "Entity breach");
        alertService.createAlert(alert);

        assertTrue(alertRepository.findById("alert-persist-1").isPresent(), "Alert must be persisted in database");

        // 5. Add Incident & Fusion
        Event event = new Event();
        event.setCameraId("cam-persist-1");
        event.setCameraName("North Tower Cam");
        event.setEventType("INTRUSION");
        event.setObjectClass("person");
        event.setTrackId(101L);

        Incident fused = incidentService.fuseEvent(event);
        assertNotNull(fused.getId());
        assertTrue(incidentRepository.findById(fused.getId()).isPresent(), "Fused incident must be persisted in database");

        // 6. Verify Audit Trail is append-only and persisted
        List<AuditEntry> auditLogs = auditRepository.findAll();
        assertFalse(auditLogs.isEmpty(), "Audit log entries must be persisted in database");
        assertTrue(auditLogs.stream().anyMatch(a -> "CREATE".equals(a.getAction())), "Audit entry for entity creation must exist");
    }

    @Test
    void testDemoLoadAndAuditedReset() {
        // Load demo data
        ResponseEntity<Map<String, Object>> loadResp = demoController.loadDemoData("test-officer");
        assertEquals(200, loadResp.getStatusCode().value());
        Map<String, Object> body = loadResp.getBody();
        assertNotNull(body);
        assertEquals("ok", body.get("status"));

        // All demo cameras and zones must be labeled [Demo]
        List<Camera> cameras = cameraService.getAll();
        assertTrue(cameras.stream().allMatch(c -> c.getName().contains("[Demo]")), "Demo cameras must be labeled [Demo]");

        // Reset system must be audited
        ResponseEntity<Map<String, Object>> clearResp = demoController.clearData(Map.of("operator", "admin"));
        assertEquals(200, clearResp.getStatusCode().value());

        // Verify audit log has RESET_SYSTEM action by admin
        List<AuditEntry> audits = auditRepository.findAll();
        boolean hasResetAudit = audits.stream().anyMatch(a -> "RESET_SYSTEM".equals(a.getAction()) && "admin".equals(a.getActor()));
        assertTrue(hasResetAudit, "Reset must be an audited admin action");
    }
}

package com.ibvap.core;

import com.ibvap.core.config.DatabaseConfig;
import com.ibvap.core.controller.AuthController;
import com.ibvap.core.model.*;
import com.ibvap.core.repository.*;
import com.ibvap.core.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:postgresql://localhost:5432/ibvap",
    "spring.datasource.username=ibvap",
    "spring.datasource.password=ibvap_secret"
})
class PostgresPersistenceIntegrationTest {

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
    private UserRepository userRepository;

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
    private AuditService auditService;

    @Test
    void testFullPersistenceStack() {
        String testSuffix = UUID.randomUUID().toString().substring(0, 6);
        String camId = "cam-pg-" + testSuffix;

        // 1. Database Engine Verification
        assertNotNull(DatabaseConfig.ACTIVE_DATABASE_ENGINE, "Database engine must be identified");
        System.out.println("[PostgresTest] Active DB engine: " + DatabaseConfig.ACTIVE_DATABASE_ENGINE);

        // 2. Camera Persistence
        Camera cam = new Camera(camId, "Checkpoint Alpha", "North Gate", "rtsp://localhost:8554/live/checkpoint");
        cameraService.addCamera(cam);
        assertTrue(cameraRepository.findById(camId).isPresent(), "Camera must persist in database");

        // 3. Virtual Zone Persistence
        String zoneId = "zone-pg-" + testSuffix;
        VirtualZone zone = new VirtualZone(zoneId, camId, "Restricted Fence", "RESTRICTED",
                List.of(new VirtualZone.Point2D(0.1, 0.2), new VirtualZone.Point2D(0.9, 0.2), new VirtualZone.Point2D(0.9, 0.8), new VirtualZone.Point2D(0.1, 0.8)));
        zoneService.addZone(zone);
        assertTrue(zoneRepository.findById(zoneId).isPresent(), "Virtual Zone must persist in database");
        VirtualZone loadedZone = zoneRepository.findById(zoneId).get();
        assertEquals(4, loadedZone.getPolygon().size(), "Zone polygon coordinates must persist exactly");

        // 4. Vehicle Sighting Persistence
        VehicleRecord rec = new VehicleRecord();
        rec.setPlateNumber("HR26DK8337");
        rec.setCameraId(camId);
        rec.setConfidence(0.92);
        vehicleService.recordObservation(rec);
        List<VehicleRecord> sightings = vehicleRepository.findByNormalizedPlate("HR26DK8337");
        assertFalse(sightings.isEmpty(), "Vehicle plate sighting must persist in database");

        // 5. Incident & Timeline Persistence
        Event event = new Event();
        event.setCameraId(camId);
        event.setCameraName("Checkpoint Alpha");
        event.setEventType("INTRUSION");
        event.setObjectClass("vehicle");
        event.setTrackId(42L);
        Incident incident = incidentService.fuseEvent(event);
        assertNotNull(incident.getId());
        assertTrue(incidentRepository.findById(incident.getId()).isPresent(), "Fused incident must persist in database");

        // 6. User and Salted Password Hash Persistence
        String salt = UUID.randomUUID().toString().substring(0, 8);
        String hash = AuthController.hashPassword("SuperSecretPass", salt);
        User testUser = new User("usr-test-" + testSuffix, "officer_" + testSuffix, hash, "OPERATOR", "Field Officer");
        userRepository.save(testUser);
        assertTrue(userRepository.findById(testUser.getId()).isPresent());
        User loadedUser = userRepository.findById(testUser.getId()).get();
        assertTrue(AuthController.verifyPassword("SuperSecretPass", loadedUser.getPasswordHash()), "Salted password hash must verify successfully");
        assertFalse(AuthController.verifyPassword("WrongPass", loadedUser.getPasswordHash()), "Invalid password must be rejected");

        // 7. Append-only Audit Log Persistence
        auditService.log("officer_" + testSuffix, "ACKNOWLEDGE", "ALERT", "alert-" + testSuffix, Map.of("action", "test_ack"));
        List<AuditEntry> auditEntries = auditRepository.findAll();
        assertFalse(auditEntries.isEmpty(), "Audit log entries must persist in database");
        assertTrue(auditEntries.stream().anyMatch(a -> a.getActor().equals("officer_" + testSuffix) && "ACKNOWLEDGE".equals(a.getAction())),
                "Audit log must contain the exact officer action");
    }
}

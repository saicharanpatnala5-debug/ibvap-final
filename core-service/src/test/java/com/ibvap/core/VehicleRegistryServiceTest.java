package com.ibvap.core;

import com.ibvap.core.model.VehicleRecord;
import com.ibvap.core.service.AuditService;
import com.ibvap.core.service.VehicleRegistryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class VehicleRegistryServiceTest {

    private VehicleRegistryService service;
    private AuditService auditService;

    @BeforeEach
    void setUp() {
        auditService = new AuditService();
        service = new VehicleRegistryService(auditService);
    }

    @Test
    void testInitialStateIsEmpty() {
        List<VehicleRecord> observed = service.getAllObserved();
        assertTrue(observed.isEmpty(), "Initial observed vehicles must be zero on fresh start");
    }

    @Test
    void testUnreadablePlateNeverAttachesDossier() {
        VehicleRecord bad = new VehicleRecord();
        bad.setPlateNumber("UNREADABLE");
        bad.setConfidence(0.20);
        bad.setOwner("Should Not Persist");
        bad.setMake("FakeMake");

        VehicleRecord result = service.recordObservation(bad);

        assertEquals("UNREADABLE", result.getStatus());
        assertNull(result.getOwner(), "Dossier owner must be null for unreadable plates");
        assertNull(result.getMake(), "Dossier make must be null for unreadable plates");
    }

    @Test
    void testKnownPlateLookupAndObservation() {
        // Register known vehicle in reference registry
        VehicleRecord known = new VehicleRecord("DL01AB1234", "VERIFIED", "Sunil Verma", "Delhi", "SEDAN", "Honda", "City");
        service.registerKnownVehicle(known);

        // Record observation from camera
        VehicleRecord obs = new VehicleRecord();
        obs.setPlateNumber("DL 01 AB 1234"); // with spaces
        obs.setConfidence(0.92);
        obs.setCameraId("cam-gate-1");

        VehicleRecord recorded = service.recordObservation(obs);

        assertEquals("DL01AB1234", recorded.getNormalizedPlate());
        assertEquals("VERIFIED", recorded.getStatus());
        assertEquals("Sunil Verma", recorded.getOwner());
        assertEquals("Honda", recorded.getMake());
    }

    @Test
    void testOperatorPlateCorrection() {
        VehicleRecord obs = new VehicleRecord();
        obs.setPlateNumber("DL01AB123?");
        obs.setConfidence(0.50);
        service.recordObservation(obs);

        // Register valid target
        service.registerKnownVehicle(new VehicleRecord("DL01AB1234", "VERIFIED", "Amit Kumar", "Delhi", "SUV", "Hyundai", "Creta"));

        // Correct plate
        Optional<VehicleRecord> corrected = service.correctPlate("DL01AB123?", "DL01AB1234", "operator1");
        assertTrue(corrected.isPresent());
        assertEquals("DL01AB1234", corrected.get().getNormalizedPlate());
        assertEquals("VERIFIED", corrected.get().getStatus());
        assertEquals("Amit Kumar", corrected.get().getOwner());
    }
}

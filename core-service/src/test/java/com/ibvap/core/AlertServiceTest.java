package com.ibvap.core;

import com.ibvap.core.model.AlertIncident;
import com.ibvap.core.service.AlertService;
import com.ibvap.core.service.AuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class AlertServiceTest {

    private AlertService alertService;
    private AuditService auditService;

    @BeforeEach
    void setUp() {
        auditService = new AuditService();
        alertService = new AlertService(auditService);
    }

    @Test
    void testInitialAlertsEmpty() {
        assertTrue(alertService.getAll().isEmpty());
    }

    @Test
    void testCreateAcknowledgeResolveAlert() {
        AlertIncident alert = new AlertIncident();
        alert.setCameraId("cam-1");
        alert.setCameraName("Perimeter East");
        alert.setSeverity("HIGH");
        alert.setType("ZONE_BREACH");
        alert.setDescription("Entity in red zone");

        AlertIncident created = alertService.createAlert(alert);
        assertNotNull(created.getId());
        assertEquals("OPEN", created.getStatus());

        List<AlertIncident> openList = alertService.getOpenAlerts();
        assertEquals(1, openList.size());

        // Acknowledge
        Optional<AlertIncident> acked = alertService.acknowledgeAlert(created.getId(), "officer_1");
        assertTrue(acked.isPresent());
        assertEquals("ACKNOWLEDGED", acked.get().getStatus());
        assertTrue(alertService.getOpenAlerts().isEmpty(), "No open alerts after acknowledge");

        // Resolve
        Optional<AlertIncident> resolved = alertService.resolveAlert(created.getId(), "officer_1");
        assertTrue(resolved.isPresent());
        assertEquals("RESOLVED", resolved.get().getStatus());
    }
}

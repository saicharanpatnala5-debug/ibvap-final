package com.ibvap.core;

import com.ibvap.core.model.Camera;
import com.ibvap.core.service.AuditService;
import com.ibvap.core.service.CameraService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class CameraServiceTest {

    private CameraService cameraService;
    private AuditService auditService;

    @BeforeEach
    void setUp() {
        auditService = new AuditService();
        cameraService = new CameraService(auditService);
    }

    @Test
    void testInitialCamerasEmpty() {
        assertTrue(cameraService.getAll().isEmpty());
    }

    @Test
    void testCleanCameraName() {
        String cleaned = CameraService.cleanCameraName("WhatsApp Video 2026-09-09 At 8.42.08 PM.mp4", 1);
        assertEquals("CCTV Feed 2026 09 09 At 8.42.08 PM", cleaned);

        String cleanedFallback = CameraService.cleanCameraName("", 3);
        assertEquals("Camera 3", cleanedFallback);
    }

    @Test
    void testAddUpdateDeleteCamera() {
        Camera cam = new Camera();
        cam.setName("Border Sector 7");
        cam.setLocation("Sector 7");
        cam.setStreamUrl("rtsp://192.168.1.100:554/live");

        Camera added = cameraService.addCamera(cam);
        assertNotNull(added.getId());
        assertEquals("Border Sector 7", added.getName());

        // Update
        Camera updateInfo = new Camera();
        updateInfo.setName("Border Sector 7 (Updated)");
        Optional<Camera> updated = cameraService.updateCamera(added.getId(), updateInfo);
        assertTrue(updated.isPresent());
        assertEquals("Border Sector 7 (Updated)", updated.get().getName());

        // Delete
        boolean deleted = cameraService.deleteCamera(added.getId());
        assertTrue(deleted);
        assertTrue(cameraService.getAll().isEmpty());
    }
}

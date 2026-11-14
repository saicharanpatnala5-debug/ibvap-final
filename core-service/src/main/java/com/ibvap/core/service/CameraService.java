package com.ibvap.core.service;

import com.ibvap.core.model.Camera;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
public class CameraService {
    private final Map<String, Camera> cameras = new ConcurrentHashMap<>();
    private final AuditService auditService;

    private static final Pattern CLEAN_FILENAME_PATTERN = Pattern.compile(
            "^(?:WhatsApp\\s+Video\\s+|VID_|VIDEO_|Recording_|Camera_)?(\\d{4}[-_\\.]?\\d{2}[-_\\.]?\\d{2}.*)",
            Pattern.CASE_INSENSITIVE
    );

    public CameraService(AuditService auditService) {
        this.auditService = auditService;
        // Clean empty state on start per master spec
    }

    public static String cleanCameraName(String rawName, int index) {
        if (rawName == null || rawName.trim().isEmpty()) {
            return "Camera " + (index > 0 ? index : 1);
        }
        String cleaned = rawName.replaceAll("\\.[a-zA-Z0-9]+$", ""); // remove extension
        cleaned = cleaned.replaceAll("[_\\-]+", " ").trim();
        cleaned = cleaned.replaceAll("(?i)^WhatsApp Video\\s*", "CCTV Feed ");
        if (cleaned.trim().isEmpty()) {
            return "Camera " + (index > 0 ? index : 1);
        }
        return cleaned;
    }

    public List<Camera> getAll() {
        return new ArrayList<>(cameras.values());
    }

    public Optional<Camera> getById(String id) {
        return Optional.ofNullable(cameras.get(id));
    }

    public Camera addCamera(Camera camera) {
        if (camera.getId() == null || camera.getId().trim().isEmpty()) {
            camera.setId(UUID.randomUUID().toString());
        }
        if (camera.getName() == null || camera.getName().trim().isEmpty()) {
            camera.setName(cleanCameraName(camera.getName(), cameras.size() + 1));
        }
        camera.setCreatedAt(Instant.now());
        cameras.put(camera.getId(), camera);

        auditService.log("operator", "CREATE", "CAMERA", camera.getId(),
                Map.of("name", camera.getName(), "location", camera.getLocation() != null ? camera.getLocation() : ""));
        return camera;
    }

    public Optional<Camera> updateCamera(String id, Camera updated) {
        Camera existing = cameras.get(id);
        if (existing == null) {
            return Optional.empty();
        }
        if (updated.getName() != null) existing.setName(updated.getName());
        if (updated.getLocation() != null) existing.setLocation(updated.getLocation());
        if (updated.getStreamUrl() != null) existing.setStreamUrl(updated.getStreamUrl());
        if (updated.getStatus() != null) existing.setStatus(updated.getStatus());
        if (updated.getFps() > 0) existing.setFps(updated.getFps());
        if (updated.getResolution() != null) existing.setResolution(updated.getResolution());

        auditService.log("operator", "UPDATE", "CAMERA", id, Map.of("name", existing.getName(), "status", existing.getStatus()));
        return Optional.of(existing);
    }

    public boolean deleteCamera(String id) {
        Camera removed = cameras.remove(id);
        if (removed != null) {
            auditService.log("operator", "DELETE", "CAMERA", id, Map.of("name", removed.getName()));
            return true;
        }
        return false;
    }

    public void clear() {
        cameras.clear();
    }
}

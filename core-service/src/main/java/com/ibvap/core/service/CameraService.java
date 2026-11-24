package com.ibvap.core.service;

import com.ibvap.core.model.Camera;
import com.ibvap.core.repository.CameraRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
public class CameraService {
    private final CameraRepository cameraRepository;
    private final AuditService auditService;
    private final Map<String, Camera> fallbackCameras = new ConcurrentHashMap<>();

    private static final Pattern CLEAN_FILENAME_PATTERN = Pattern.compile(
            "^(?:WhatsApp\\s+Video\\s+|VID_|VIDEO_|Recording_|Camera_)?(\\d{4}[-_\\.]?\\d{2}[-_\\.]?\\d{2}.*)",
            Pattern.CASE_INSENSITIVE
    );

    @Autowired(required = false)
    public CameraService(CameraRepository cameraRepository, AuditService auditService) {
        this.cameraRepository = cameraRepository;
        this.auditService = auditService;
    }

    public CameraService(AuditService auditService) {
        this(null, auditService);
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
        if (cameraRepository != null) {
            try {
                return cameraRepository.findAll();
            } catch (Exception ignored) {}
        }
        return new ArrayList<>(fallbackCameras.values());
    }

    public Optional<Camera> getById(String id) {
        if (cameraRepository != null) {
            try {
                return cameraRepository.findById(id);
            } catch (Exception ignored) {}
        }
        return Optional.ofNullable(fallbackCameras.get(id));
    }

    public Camera addCamera(Camera camera) {
        if (camera.getId() == null || camera.getId().trim().isEmpty()) {
            camera.setId(UUID.randomUUID().toString());
        }
        if (camera.getName() == null || camera.getName().trim().isEmpty()) {
            camera.setName(cleanCameraName(camera.getName(), getAll().size() + 1));
        }
        if (camera.getCreatedAt() == null) {
            camera.setCreatedAt(Instant.now());
        }

        if (cameraRepository != null) {
            try {
                camera = cameraRepository.save(camera);
            } catch (Exception ignored) {
                fallbackCameras.put(camera.getId(), camera);
            }
        } else {
            fallbackCameras.put(camera.getId(), camera);
        }

        auditService.log("operator", "CREATE", "CAMERA", camera.getId(),
                Map.of("name", camera.getName(), "location", camera.getLocation() != null ? camera.getLocation() : ""));
        return camera;
    }

    public Optional<Camera> updateCamera(String id, Camera updated) {
        Optional<Camera> existingOpt = getById(id);
        if (existingOpt.isEmpty()) {
            return Optional.empty();
        }
        Camera existing = existingOpt.get();
        if (updated.getName() != null) existing.setName(updated.getName());
        if (updated.getLocation() != null) existing.setLocation(updated.getLocation());
        if (updated.getStreamUrl() != null) existing.setStreamUrl(updated.getStreamUrl());
        if (updated.getStatus() != null) existing.setStatus(updated.getStatus());
        if (updated.getFps() > 0) existing.setFps(updated.getFps());
        if (updated.getResolution() != null) existing.setResolution(updated.getResolution());

        if (cameraRepository != null) {
            try {
                existing = cameraRepository.save(existing);
            } catch (Exception ignored) {
                fallbackCameras.put(id, existing);
            }
        } else {
            fallbackCameras.put(id, existing);
        }

        auditService.log("operator", "UPDATE", "CAMERA", id, Map.of("name", existing.getName(), "status", existing.getStatus()));
        return Optional.of(existing);
    }

    public boolean deleteCamera(String id) {
        Optional<Camera> existing = getById(id);
        if (existing.isPresent()) {
            if (cameraRepository != null) {
                try {
                    cameraRepository.deleteById(id);
                } catch (Exception ignored) {
                    fallbackCameras.remove(id);
                }
            } else {
                fallbackCameras.remove(id);
            }
            auditService.log("operator", "DELETE", "CAMERA", id, Map.of("name", existing.get().getName()));
            return true;
        }
        return false;
    }

    public void clear() {
        if (cameraRepository != null) {
            try {
                cameraRepository.deleteAll();
            } catch (Exception ignored) {}
        }
        fallbackCameras.clear();
    }
}

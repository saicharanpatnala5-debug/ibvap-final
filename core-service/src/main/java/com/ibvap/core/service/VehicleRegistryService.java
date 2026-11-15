package com.ibvap.core.service;

import com.ibvap.core.model.VehicleRecord;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class VehicleRegistryService {
    public static final String CURRENT_SCHEMA_VERSION = "v8.0.0";
    public static final String CURRENT_RUN_ID = "r8-release-20261115";

    // Registered vehicles known in National/RTO registry (reference simulated DB)
    private final Map<String, VehicleRecord> registryDb = new ConcurrentHashMap<>();

    // Real observations logged from live cameras/streams (starts EMPTY)
    private final Map<String, VehicleRecord> observedPlates = new ConcurrentHashMap<>();

    private final AuditService auditService;

    // Standard Indian vehicle plate regex: e.g. DL01AB1234 or HR26DK8337 or MH12DE1433
    private static final Pattern VALID_IN_PLATE = Pattern.compile("^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$");

    public VehicleRegistryService(AuditService auditService) {
        this.auditService = auditService;
        // Clean empty state on start per master spec
    }

    public static String normalize(String plate) {
        if (plate == null) return "";
        return plate.replaceAll("[^A-Za-z0-9]", "").toUpperCase();
    }

    public List<VehicleRecord> getAllObserved() {
        return observedPlates.values().stream()
                .filter(v -> CURRENT_SCHEMA_VERSION.equals(v.getSchemaVersion()))
                .collect(Collectors.toList());
    }

    public Optional<VehicleRecord> getObservedByPlate(String plate) {
        String norm = normalize(plate);
        return Optional.ofNullable(observedPlates.get(norm))
                .filter(v -> CURRENT_SCHEMA_VERSION.equals(v.getSchemaVersion()));
    }

    /**
     * Record an ANPR observation from AI-service or camera stream.
     * Enforces dossier integrity: UNREADABLE or LOW_CONFIDENCE plates never get attached to fake dossiers.
     */
    public VehicleRecord recordObservation(VehicleRecord observation) {
        if (observation.getSchemaVersion() != null && !CURRENT_SCHEMA_VERSION.equals(observation.getSchemaVersion())) {
            return null;
        }
        observation.setSchemaVersion(CURRENT_SCHEMA_VERSION);
        if (observation.getRunId() == null) {
            observation.setRunId(CURRENT_RUN_ID);
        }

        String rawPlate = observation.getPlateNumber();
        String norm = normalize(rawPlate);
        observation.setNormalizedPlate(norm);

        double conf = observation.getConfidence();
        boolean isValidFormat = VALID_IN_PLATE.matcher(norm).matches();

        if (norm.isEmpty() || norm.contains("UNREADABLE") || conf < 0.35) {
            observation.setStatus("UNREADABLE");
            observation.setOwner(null);
            observation.setMake(null);
            observation.setModel(null);
            observation.setState(null);
        } else if (conf < 0.60 || !isValidFormat) {
            observation.setStatus("LOW_CONFIDENCE");
            observation.setOwner(null);
            observation.setMake(null);
            observation.setModel(null);
        } else {
            // Check reference registry database for dossier
            VehicleRecord known = registryDb.get(norm);
            if (known != null) {
                observation.setStatus(known.getStatus());
                observation.setOwner(known.getOwner());
                observation.setState(known.getState());
                observation.setVehicleType(known.getVehicleType());
                observation.setMake(known.getMake());
                observation.setModel(known.getModel());
                observation.setColor(known.getColor());
            } else {
                observation.setStatus("UNREGISTERED");
                observation.setOwner(null);
                observation.setMake(null);
                observation.setModel(null);
            }
        }

        observation.setRecordedAt(Instant.now());
        observedPlates.put(norm.isEmpty() ? "UNREADABLE-" + UUID.randomUUID() : norm, observation);

        auditService.log("anpr_service", "RECORD_OBSERVATION", "VEHICLE", norm,
                Map.of("confidence", conf, "status", observation.getStatus(), "cameraId", observation.getCameraId() != null ? observation.getCameraId() : ""));

        return observation;
    }

    /**
     * Operator manually corrects a misread plate number
     */
    public Optional<VehicleRecord> correctPlate(String oldPlate, String correctedPlate, String operator) {
        String oldNorm = normalize(oldPlate);
        VehicleRecord existing = observedPlates.remove(oldNorm);
        if (existing == null) {
            return Optional.empty();
        }

        String newNorm = normalize(correctedPlate);
        existing.setPlateNumber(correctedPlate);
        existing.setNormalizedPlate(newNorm);
        existing.setConfidence(1.0); // manual verification

        // Re-evaluate against registry
        VehicleRecord known = registryDb.get(newNorm);
        if (known != null) {
            existing.setStatus(known.getStatus());
            existing.setOwner(known.getOwner());
            existing.setState(known.getState());
            existing.setVehicleType(known.getVehicleType());
            existing.setMake(known.getMake());
            existing.setModel(known.getModel());
        } else if (VALID_IN_PLATE.matcher(newNorm).matches()) {
            existing.setStatus("VALID_FORMAT");
        } else {
            existing.setStatus("UNREGISTERED");
        }

        observedPlates.put(newNorm, existing);

        auditService.log(operator != null ? operator : "operator", "CORRECT_PLATE", "VEHICLE", newNorm,
                Map.of("oldPlate", oldNorm, "newPlate", newNorm));

        return Optional.of(existing);
    }

    /**
     * Seed registry database (e.g. for watchlist or verified database)
     */
    public void registerKnownVehicle(VehicleRecord vehicle) {
        String norm = normalize(vehicle.getPlateNumber());
        vehicle.setNormalizedPlate(norm);
        registryDb.put(norm, vehicle);
    }

    public Optional<VehicleRecord> lookupRegistry(String plate) {
        String norm = normalize(plate);
        return Optional.ofNullable(registryDb.get(norm));
    }

    public void clear() {
        observedPlates.clear();
        registryDb.clear();
    }
}

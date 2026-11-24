package com.ibvap.core.service;

import com.ibvap.core.model.VehicleRecord;
import com.ibvap.core.repository.VehicleRecordRepository;
import org.springframework.beans.factory.annotation.Autowired;
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

    private final VehicleRecordRepository vehicleRepository;
    private final AuditService auditService;

    // Reference simulated registry DB
    private final Map<String, VehicleRecord> registryDb = new ConcurrentHashMap<>();

    // In-memory fallback
    private final Map<String, VehicleRecord> fallbackObserved = new ConcurrentHashMap<>();

    // Standard Indian vehicle plate regex: e.g. DL01AB1234 or HR26DK8337 or MH12DE1433
    private static final Pattern VALID_IN_PLATE = Pattern.compile("^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$");

    @Autowired(required = false)
    public VehicleRegistryService(VehicleRecordRepository vehicleRepository, AuditService auditService) {
        this.vehicleRepository = vehicleRepository;
        this.auditService = auditService;
    }

    public VehicleRegistryService(AuditService auditService) {
        this(null, auditService);
    }

    public static String normalize(String plate) {
        if (plate == null) return "";
        return plate.replaceAll("[^A-Za-z0-9]", "").toUpperCase();
    }

    public List<VehicleRecord> getAllObserved() {
        if (vehicleRepository != null) {
            try {
                return vehicleRepository.findAllByOrderByRecordedAtDesc().stream()
                        .filter(v -> CURRENT_SCHEMA_VERSION.equals(v.getSchemaVersion()))
                        .collect(Collectors.toList());
            } catch (Exception ignored) {}
        }
        return fallbackObserved.values().stream()
                .filter(v -> CURRENT_SCHEMA_VERSION.equals(v.getSchemaVersion()))
                .collect(Collectors.toList());
    }

    public Optional<VehicleRecord> getObservedByPlate(String plate) {
        String norm = normalize(plate);
        if (vehicleRepository != null) {
            try {
                return vehicleRepository.findTopByNormalizedPlateOrderByRecordedAtDesc(norm)
                        .filter(v -> CURRENT_SCHEMA_VERSION.equals(v.getSchemaVersion()));
            } catch (Exception ignored) {}
        }
        return Optional.ofNullable(fallbackObserved.get(norm))
                .filter(v -> CURRENT_SCHEMA_VERSION.equals(v.getSchemaVersion()));
    }

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

        if (vehicleRepository != null) {
            try {
                observation = vehicleRepository.save(observation);
            } catch (Exception ignored) {
                fallbackObserved.put(norm.isEmpty() ? "UNREADABLE-" + UUID.randomUUID() : norm, observation);
            }
        } else {
            fallbackObserved.put(norm.isEmpty() ? "UNREADABLE-" + UUID.randomUUID() : norm, observation);
        }

        auditService.log("anpr_service", "RECORD_OBSERVATION", "VEHICLE", norm,
                Map.of("confidence", conf, "status", observation.getStatus(), "cameraId", observation.getCameraId() != null ? observation.getCameraId() : ""));

        return observation;
    }

    public Optional<VehicleRecord> correctPlate(String oldPlate, String correctedPlate, String operator) {
        String oldNorm = normalize(oldPlate);
        Optional<VehicleRecord> existingOpt = getObservedByPlate(oldNorm);
        if (existingOpt.isEmpty()) {
            return Optional.empty();
        }

        VehicleRecord existing = existingOpt.get();
        String newNorm = normalize(correctedPlate);
        existing.setPlateNumber(correctedPlate);
        existing.setNormalizedPlate(newNorm);
        existing.setConfidence(1.0);

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

        if (vehicleRepository != null) {
            try {
                existing = vehicleRepository.save(existing);
            } catch (Exception ignored) {
                fallbackObserved.remove(oldNorm);
                fallbackObserved.put(newNorm, existing);
            }
        } else {
            fallbackObserved.remove(oldNorm);
            fallbackObserved.put(newNorm, existing);
        }

        auditService.log(operator != null ? operator : "operator", "CORRECT_PLATE", "VEHICLE", newNorm,
                Map.of("oldPlate", oldNorm, "newPlate", newNorm));

        return Optional.of(existing);
    }

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
        if (vehicleRepository != null) {
            try {
                vehicleRepository.deleteAll();
            } catch (Exception ignored) {}
        }
        fallbackObserved.clear();
        registryDb.clear();
    }
}

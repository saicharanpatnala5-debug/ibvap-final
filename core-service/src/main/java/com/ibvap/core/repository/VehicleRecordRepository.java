package com.ibvap.core.repository;

import com.ibvap.core.model.VehicleRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface VehicleRecordRepository extends JpaRepository<VehicleRecord, String> {
    List<VehicleRecord> findByNormalizedPlate(String normalizedPlate);
    List<VehicleRecord> findByCameraId(String cameraId);
    List<VehicleRecord> findAllByOrderByRecordedAtDesc();
    Optional<VehicleRecord> findTopByNormalizedPlateOrderByRecordedAtDesc(String normalizedPlate);
}

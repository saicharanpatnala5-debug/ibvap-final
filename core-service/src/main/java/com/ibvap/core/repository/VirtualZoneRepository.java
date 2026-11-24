package com.ibvap.core.repository;

import com.ibvap.core.model.VirtualZone;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface VirtualZoneRepository extends JpaRepository<VirtualZone, String> {
    List<VirtualZone> findByCameraId(String cameraId);
}

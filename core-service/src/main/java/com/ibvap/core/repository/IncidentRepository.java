package com.ibvap.core.repository;

import com.ibvap.core.model.Incident;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface IncidentRepository extends JpaRepository<Incident, String> {
    List<Incident> findAllByOrderByStartedAtDesc();
    List<Incident> findByStatusOrderByStartedAtDesc(String status);
    List<Incident> findByCameraIdOrderByStartedAtDesc(String cameraId);
}

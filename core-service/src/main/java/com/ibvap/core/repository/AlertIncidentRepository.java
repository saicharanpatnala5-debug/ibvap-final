package com.ibvap.core.repository;

import com.ibvap.core.model.AlertIncident;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AlertIncidentRepository extends JpaRepository<AlertIncident, String> {
    List<AlertIncident> findByStatusOrderByTimestampDesc(String status);
    List<AlertIncident> findAllByOrderByTimestampDesc();
}

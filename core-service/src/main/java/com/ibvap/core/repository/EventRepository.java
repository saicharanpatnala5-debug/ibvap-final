package com.ibvap.core.repository;

import com.ibvap.core.model.Event;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EventRepository extends JpaRepository<Event, String> {
    List<Event> findByIncidentIdOrderByTimestampAsc(String incidentId);
    List<Event> findByCameraIdOrderByTimestampDesc(String cameraId);
    List<Event> findAllByOrderByTimestampDesc();
}

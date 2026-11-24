package com.ibvap.core.repository;

import com.ibvap.core.model.AuditEntry;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AuditEntryRepository extends JpaRepository<AuditEntry, String> {
    List<AuditEntry> findAllByOrderByTimestampDesc(Pageable pageable);
    List<AuditEntry> findByTargetTypeOrderByTimestampDesc(String targetType, Pageable pageable);
}

package com.ibvap.core.service;

import com.ibvap.core.model.AuditEntry;
import com.ibvap.core.repository.AuditEntryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.stream.Collectors;

@Service
public class AuditService {
    private final AuditEntryRepository auditEntryRepository;
    private final ConcurrentLinkedDeque<AuditEntry> fallbackAuditLogs = new ConcurrentLinkedDeque<>();
    private static final int MAX_AUDIT_LOGS = 10000;

    @Autowired(required = false)
    public AuditService(AuditEntryRepository auditEntryRepository) {
        this.auditEntryRepository = auditEntryRepository;
    }

    public AuditService() {
        this(null);
    }

    public AuditEntry log(String actor, String action, String targetType, String targetId, Map<String, Object> details) {
        String id = UUID.randomUUID().toString();
        AuditEntry entry = new AuditEntry(id, actor != null ? actor : "system", action, targetType, targetId, details);
        entry.setTimestamp(Instant.now());

        if (auditEntryRepository != null) {
            try {
                return auditEntryRepository.save(entry);
            } catch (Exception e) {
                // fallback to in-memory if transient DB glitch
            }
        }

        fallbackAuditLogs.addFirst(entry);
        while (fallbackAuditLogs.size() > MAX_AUDIT_LOGS) {
            fallbackAuditLogs.pollLast();
        }
        return entry;
    }

    public List<AuditEntry> getAll(int limit) {
        int effLimit = limit > 0 ? limit : 100;
        if (auditEntryRepository != null) {
            try {
                return auditEntryRepository.findAllByOrderByTimestampDesc(PageRequest.of(0, effLimit));
            } catch (Exception e) {
                // fallback
            }
        }
        return fallbackAuditLogs.stream().limit(effLimit).collect(Collectors.toList());
    }

    public List<AuditEntry> getByTargetType(String targetType, int limit) {
        int effLimit = limit > 0 ? limit : 100;
        if (auditEntryRepository != null && targetType != null) {
            try {
                return auditEntryRepository.findByTargetTypeOrderByTimestampDesc(targetType, PageRequest.of(0, effLimit));
            } catch (Exception e) {
                // fallback
            }
        }
        return fallbackAuditLogs.stream()
                .filter(e -> targetType == null || targetType.equalsIgnoreCase(e.getTargetType()))
                .limit(effLimit)
                .collect(Collectors.toList());
    }

    public void clear() {
        if (auditEntryRepository != null) {
            try {
                auditEntryRepository.deleteAll();
            } catch (Exception ignored) {}
        }
        fallbackAuditLogs.clear();
    }
}

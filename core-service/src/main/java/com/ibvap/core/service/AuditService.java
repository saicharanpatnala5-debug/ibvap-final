package com.ibvap.core.service;

import com.ibvap.core.model.AuditEntry;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.stream.Collectors;

@Service
public class AuditService {
    private final ConcurrentLinkedDeque<AuditEntry> auditLogs = new ConcurrentLinkedDeque<>();
    private static final int MAX_AUDIT_LOGS = 10000;

    public AuditEntry log(String actor, String action, String targetType, String targetId, Map<String, Object> details) {
        String id = UUID.randomUUID().toString();
        AuditEntry entry = new AuditEntry(id, actor != null ? actor : "system", action, targetType, targetId, details);
        auditLogs.addFirst(entry);
        while (auditLogs.size() > MAX_AUDIT_LOGS) {
            auditLogs.pollLast();
        }
        return entry;
    }

    public List<AuditEntry> getAll(int limit) {
        return auditLogs.stream()
                .limit(limit > 0 ? limit : 100)
                .collect(Collectors.toList());
    }

    public List<AuditEntry> getByTargetType(String targetType, int limit) {
        return auditLogs.stream()
                .filter(e -> targetType == null || targetType.equalsIgnoreCase(e.getTargetType()))
                .limit(limit > 0 ? limit : 100)
                .collect(Collectors.toList());
    }

    public void clear() {
        auditLogs.clear();
    }
}

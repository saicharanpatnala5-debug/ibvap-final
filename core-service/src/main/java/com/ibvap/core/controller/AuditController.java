package com.ibvap.core.controller;

import com.ibvap.core.model.AuditEntry;
import com.ibvap.core.service.AuditService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/audit")
public class AuditController {
    private final AuditService auditService;

    public AuditController(AuditService auditService) {
        this.auditService = auditService;
    }

    @GetMapping
    public ResponseEntity<List<AuditEntry>> getAuditLogs(
            @RequestParam(required = false) String targetType,
            @RequestParam(required = false, defaultValue = "100") int limit) {
        if (targetType != null && !targetType.isBlank()) {
            return ResponseEntity.ok(auditService.getByTargetType(targetType, limit));
        }
        return ResponseEntity.ok(auditService.getAll(limit));
    }

    @PostMapping
    public ResponseEntity<AuditEntry> logAction(@RequestBody Map<String, Object> body) {
        String actor = (String) body.getOrDefault("actor", "operator");
        String action = (String) body.getOrDefault("action", "ACTION");
        String targetType = (String) body.getOrDefault("targetType", "SYSTEM");
        String targetId = (String) body.getOrDefault("targetId", "");
        @SuppressWarnings("unchecked")
        Map<String, Object> details = (Map<String, Object>) body.getOrDefault("details", Map.of());

        AuditEntry entry = auditService.log(actor, action, targetType, targetId, details);
        return ResponseEntity.ok(entry);
    }
}

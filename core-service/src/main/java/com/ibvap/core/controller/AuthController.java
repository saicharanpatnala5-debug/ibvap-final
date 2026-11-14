package com.ibvap.core.controller;

import com.ibvap.core.model.AuthDto;
import com.ibvap.core.service.AuditService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuditService auditService;

    public AuthController(AuditService auditService) {
        this.auditService = auditService;
    }

    @PostMapping("/login")
    public ResponseEntity<AuthDto.UserProfile> login(@RequestBody(required = false) AuthDto.LoginRequest request) {
        String username = (request != null && request.getUsername() != null && !request.getUsername().isBlank())
                ? request.getUsername() : "operator";
        String role = "admin".equalsIgnoreCase(username) ? "COMMANDER" : "OPERATOR";
        String token = "jwt_" + UUID.randomUUID().toString().replace("-", "");

        auditService.log(username, "LOGIN", "AUTH", username, Map.of("role", role));
        return ResponseEntity.ok(new AuthDto.UserProfile(UUID.randomUUID().toString(), username, role, token));
    }

    @GetMapping("/me")
    public ResponseEntity<AuthDto.UserProfile> me(@RequestHeader(value = "Authorization", required = false) String auth) {
        return ResponseEntity.ok(new AuthDto.UserProfile("usr-active", "operator", "OPERATOR", "active-session"));
    }
}

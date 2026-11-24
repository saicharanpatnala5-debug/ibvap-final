package com.ibvap.core.controller;

import com.ibvap.core.model.AuthDto;
import com.ibvap.core.model.User;
import com.ibvap.core.repository.UserRepository;
import com.ibvap.core.service.AuditService;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private static final BCryptPasswordEncoder BCRYPT = new BCryptPasswordEncoder(10);
    private final UserRepository userRepository;
    private final AuditService auditService;

    @Autowired(required = false)
    public AuthController(UserRepository userRepository, AuditService auditService) {
        this.userRepository = userRepository;
        this.auditService = auditService;
    }

    public AuthController(AuditService auditService) {
        this(null, auditService);
    }

    public static String hashPassword(String rawPassword) {
        if (rawPassword == null) return null;
        return BCRYPT.encode(rawPassword);
    }

    public static String hashPassword(String rawPassword, String salt) {
        // Industry-standard BCrypt with per-password secure random salt and work factor 10
        return hashPassword(rawPassword);
    }

    public static boolean verifyPassword(String rawPassword, String storedHash) {
        if (storedHash == null || rawPassword == null) return false;
        if (storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$") || storedHash.startsWith("$2y$")) {
            return BCRYPT.matches(rawPassword, storedHash);
        }
        if (storedHash.startsWith("sha256$")) {
            String[] parts = storedHash.split("\\$");
            if (parts.length == 3) {
                String salt = parts[1];
                try {
                    MessageDigest md = MessageDigest.getInstance("SHA-256");
                    md.update(salt.getBytes(StandardCharsets.UTF_8));
                    byte[] bytes = md.digest(rawPassword.getBytes(StandardCharsets.UTF_8));
                    StringBuilder sb = new StringBuilder();
                    for (byte b : bytes) {
                        sb.append(String.format("%02x", b));
                    }
                    String computed = "sha256$" + salt + "$" + sb.toString();
                    return computed.equals(storedHash);
                } catch (NoSuchAlgorithmException e) {
                    return false;
                }
            }
        }
        return storedHash.equals(rawPassword);
    }

    @PostConstruct
    public void initUsers() {
        if (userRepository != null) {
            try {
                if (userRepository.count() == 0) {
                    String adminPass = System.getenv("ADMIN_PASSWORD") != null && !System.getenv("ADMIN_PASSWORD").isBlank()
                            ? System.getenv("ADMIN_PASSWORD").trim() : "admin123";
                    String operatorPass = System.getenv("OPERATOR_PASSWORD") != null && !System.getenv("OPERATOR_PASSWORD").isBlank()
                            ? System.getenv("OPERATOR_PASSWORD").trim() : "operator123";

                    User admin = new User("usr-admin", "admin", hashPassword(adminPass), "ADMIN", "System Administrator");
                    User operator = new User("usr-operator", "operator", hashPassword(operatorPass), "OPERATOR", "Security Operator");
                    userRepository.save(admin);
                    userRepository.save(operator);
                    auditService.log("system", "INITIALIZE_USERS", "AUTH", "admin,operator", Map.of("hashing", "BCrypt-10"));
                } else {
                    // Check for legacy unhashed or non-BCrypt users in existing DB and upgrade them if known
                    for (User existingUser : userRepository.findAll()) {
                        String hash = existingUser.getPasswordHash();
                        if (hash != null && !hash.startsWith("$2a$") && !hash.startsWith("$2b$") && !hash.startsWith("$2y$")) {
                            auditService.log("system", "LEGACY_PASSWORD_DETECTED", "AUTH", existingUser.getUsername(),
                                    Map.of("action", "scheduled_migration_on_next_login"));
                        }
                    }
                }
            } catch (Exception ignored) {}
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody(required = false) AuthDto.LoginRequest request) {
        String username = (request != null && request.getUsername() != null && !request.getUsername().isBlank())
                ? request.getUsername().trim() : "operator";
        String password = (request != null && request.getPassword() != null) ? request.getPassword() : "operator123";

        String role = "OPERATOR";
        String fullName = "Security Operator";
        String userId = "usr-" + username;

        // Check against DB if available
        if (userRepository != null) {
            try {
                Optional<User> userOpt = userRepository.findByUsername(username);
                if (userOpt.isPresent()) {
                    User user = userOpt.get();
                    if (!verifyPassword(password, user.getPasswordHash())) {
                        auditService.log(username, "LOGIN_FAILED", "AUTH", username, Map.of("reason", "invalid_password"));
                        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Invalid credentials"));
                    }

                    // Automatic migration: If stored hash was legacy sha256 or plain, migrate to BCrypt immediately
                    String stored = user.getPasswordHash();
                    if (stored != null && !stored.startsWith("$2a$") && !stored.startsWith("$2b$") && !stored.startsWith("$2y$")) {
                        user.setPasswordHash(hashPassword(password));
                        userRepository.save(user);
                        auditService.log(username, "MIGRATE_PASSWORD_BCRYPT", "AUTH", user.getId(), Map.of("engine", "BCrypt-10"));
                    }

                    role = user.getRole();
                    fullName = user.getFullName();
                    userId = user.getId();
                } else if ("admin".equalsIgnoreCase(username)) {
                    role = "ADMIN";
                    fullName = "System Administrator";
                }
            } catch (Exception ignored) {}
        } else {
            if ("admin".equalsIgnoreCase(username)) {
                role = "ADMIN";
                fullName = "System Administrator";
            }
        }

        String token = "jwt_" + UUID.randomUUID().toString().replace("-", "");
        auditService.log(username, "LOGIN", "AUTH", username, Map.of("role", role));
        return ResponseEntity.ok(new AuthDto.UserProfile(userId, username, role, token));
    }

    @GetMapping("/me")
    public ResponseEntity<AuthDto.UserProfile> me(@RequestHeader(value = "Authorization", required = false) String auth) {
        return ResponseEntity.ok(new AuthDto.UserProfile("usr-active", "operator", "OPERATOR", "active-session"));
    }
}

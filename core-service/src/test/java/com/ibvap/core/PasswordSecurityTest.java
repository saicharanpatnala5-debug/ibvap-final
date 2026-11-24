package com.ibvap.core;

import com.ibvap.core.controller.AuthController;
import com.ibvap.core.model.AuthDto;
import com.ibvap.core.model.User;
import com.ibvap.core.repository.UserRepository;
import com.ibvap.core.service.AuditService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:pwdtestdb;DB_CLOSE_DELAY=-1;MODE=PostgreSQL",
    "spring.datasource.driver-class-name=org.h2.Driver"
})
class PasswordSecurityTest {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AuditService auditService;

    @Test
    @DisplayName("Verify BCrypt password encoding, work factor, and validation")
    void testBCryptHashingAndValidation() {
        String rawPassword = "TacticalPassword@2026";
        String encoded = AuthController.hashPassword(rawPassword);

        // Standard Spring Security BCrypt starts with $2a$ or $2b$ and length 60
        assertNotNull(encoded);
        assertTrue(encoded.startsWith("$2a$10$") || encoded.startsWith("$2b$10$"), "Must use BCrypt with work factor 10");
        assertEquals(60, encoded.length(), "BCrypt hash length must be exactly 60 chars");

        // Verification matches
        assertTrue(AuthController.verifyPassword(rawPassword, encoded), "BCrypt matches raw password");
        assertFalse(AuthController.verifyPassword("WrongPassword", encoded), "BCrypt must reject wrong password");
        assertFalse(AuthController.verifyPassword("", encoded), "Empty password must be rejected");
        assertFalse(AuthController.verifyPassword(null, encoded), "Null password must be rejected");
    }

    @Test
    @DisplayName("Verify automatic migration of legacy SHA-256 user hashes to BCrypt on successful login")
    void testLegacyUserMigrationToBCrypt() {
        String testUser = "legacy_officer_" + UUID.randomUUID().toString().substring(0, 6);
        String plainPassword = "LegacyPass@123";

        // Seed a legacy sha256 user in repository
        String legacySalt = "salt1234";
        String legacyHash = "sha256$" + legacySalt + "$e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        // Compute actual sha256 for plainPassword
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            md.update(legacySalt.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            byte[] bytes = md.digest(plainPassword.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) sb.append(String.format("%02x", b));
            legacyHash = "sha256$" + legacySalt + "$" + sb.toString();
        } catch (Exception ignored) {}

        User user = new User("usr-" + testUser, testUser, legacyHash, "OPERATOR", "Legacy Officer");
        userRepository.save(user);

        // Verify pre-condition: user has legacy SHA-256 hash
        User preLogin = userRepository.findByUsername(testUser).orElseThrow();
        assertTrue(preLogin.getPasswordHash().startsWith("sha256$"), "Must start with legacy sha256");

        // Attempt login via controller
        AuthController controller = new AuthController(userRepository, auditService);
        AuthDto.LoginRequest req = new AuthDto.LoginRequest();
        req.setUsername(testUser);
        req.setPassword(plainPassword);

        ResponseEntity<?> response = controller.login(req);
        assertEquals(HttpStatus.OK, response.getStatusCode(), "Login should succeed");

        // Verify post-condition: user hash has been automatically migrated to BCrypt
        User postLogin = userRepository.findByUsername(testUser).orElseThrow();
        String migratedHash = postLogin.getPasswordHash();
        assertNotNull(migratedHash);
        assertTrue(migratedHash.startsWith("$2a$10$") || migratedHash.startsWith("$2b$10$"), "Legacy hash must be migrated to BCrypt on login");
        assertEquals(60, migratedHash.length());
        assertTrue(AuthController.verifyPassword(plainPassword, migratedHash), "New BCrypt hash must match original password");
    }
}

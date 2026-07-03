package com.projectos.security;

import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.security.spec.KeySpec;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.projectos.marketplace.install.InstallationException;
import com.projectos.system.ProjectSettingsRepository;

@Service
public class AdminSecurityService {

    private static final String CLAIMED = "adminSecurityClaimed";
    private static final String SETUP_CODE = "adminSecuritySetupCode";
    private static final String PASSWORD_HASH = "adminSecurityPasswordHash";
    private static final String PASSWORD_SALT = "adminSecurityPasswordSalt";
    private static final String UPDATED_AT = "adminSecurityUpdatedAt";
    private static final int MIN_PASSWORD_LENGTH = 12;

    private final ProjectSettingsRepository repository;
    private final boolean devMode;
    private final SecureRandom random = new SecureRandom();
    private final ConcurrentHashMap<String, String> sessions = new ConcurrentHashMap<>();

    public AdminSecurityService(ProjectSettingsRepository repository, @Value("${project-os.dev-mode:false}") boolean devMode) {
        this.repository = repository;
        this.devMode = devMode;
    }

    public AdminSecurityStatus status() {
        if (devMode) {
            return new AdminSecurityStatus(true, true, false, "Dev mode is active. Admin login is disabled for local development.", "");
        }
        Map<String, String> values = repository.readAll();
        boolean claimed = Boolean.parseBoolean(values.getOrDefault(CLAIMED, "false"));
        if (claimed) {
            return new AdminSecurityStatus(false, true, true, "Admin login is required for changes.", "");
        }
        String setupCode = values.get(SETUP_CODE);
        if (setupCode == null || setupCode.isBlank()) {
            setupCode = randomCode();
            repository.saveValues(Map.of(
                    SETUP_CODE, setupCode,
                    CLAIMED, "false",
                    UPDATED_AT, Instant.now().toString()));
        }
        return new AdminSecurityStatus(false, false, true, "Claim this Autark-OS install before making changes.", setupCode);
    }

    public AdminSecuritySession claim(AdminClaimRequest request) {
        if (devMode) {
            return new AdminSecuritySession(true, "dev-mode", "Dev mode does not require admin login.");
        }
        AdminSecurityStatus current = status();
        if (current.claimed()) {
            return AdminSecuritySession.denied("Autark-OS has already been claimed. Log in instead.");
        }
        if (request == null || request.setupCode() == null || !constantEquals(current.setupCode(), request.setupCode().trim())) {
            return AdminSecuritySession.denied("The setup code did not match this Autark-OS install.");
        }
        String password = request.password() == null ? "" : request.password();
        if (password.length() < MIN_PASSWORD_LENGTH) {
            return AdminSecuritySession.denied("Use an admin password with at least 12 characters.");
        }
        String salt = randomToken(24);
        repository.saveValues(Map.of(
                CLAIMED, "true",
                SETUP_CODE, "",
                PASSWORD_SALT, salt,
                PASSWORD_HASH, hash(password, salt),
                UPDATED_AT, Instant.now().toString()));
        return issueSession("Autark-OS admin setup is complete.");
    }

    public AdminSecuritySession login(AdminLoginRequest request) {
        if (devMode) {
            return new AdminSecuritySession(true, "dev-mode", "Dev mode does not require admin login.");
        }
        Map<String, String> values = repository.readAll();
        if (!Boolean.parseBoolean(values.getOrDefault(CLAIMED, "false"))) {
            return AdminSecuritySession.denied("Claim this Autark-OS install before logging in.");
        }
        String password = request == null || request.password() == null ? "" : request.password();
        String salt = values.getOrDefault(PASSWORD_SALT, "");
        String expectedHash = values.getOrDefault(PASSWORD_HASH, "");
        if (salt.isBlank() || expectedHash.isBlank() || !constantEquals(expectedHash, hash(password, salt))) {
            return AdminSecuritySession.denied("Admin password was not accepted.");
        }
        return issueSession("Logged in to Autark-OS.");
    }

    public boolean authenticate(String token) {
        if (devMode) {
            return true;
        }
        if (token == null || token.isBlank()) {
            return false;
        }
        return sessions.containsKey(token);
    }

    public void logout(String token) {
        if (token != null) {
            sessions.remove(token);
        }
    }

    private AdminSecuritySession issueSession(String message) {
        String token = randomToken(32);
        sessions.put(token, Instant.now().toString());
        return new AdminSecuritySession(true, token, message);
    }

    private String randomCode() {
        return "%06d".formatted(random.nextInt(1_000_000));
    }

    private String randomToken(int bytes) {
        byte[] value = new byte[bytes];
        random.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private String hash(String value, String salt) {
        try {
            KeySpec spec = new PBEKeySpec(value.toCharArray(), salt.getBytes(java.nio.charset.StandardCharsets.UTF_8), 120_000, 256);
            return Base64.getEncoder().encodeToString(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded());
        } catch (NoSuchAlgorithmException | InvalidKeySpecException exception) {
            throw new InstallationException("Unable to protect Autark-OS admin credentials.", exception);
        }
    }

    private boolean constantEquals(String left, String right) {
        byte[] leftBytes = left == null ? new byte[0] : left.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        byte[] rightBytes = right == null ? new byte[0] : right.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        return java.security.MessageDigest.isEqual(leftBytes, rightBytes);
    }
}

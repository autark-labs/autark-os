package com.autarkos.security;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.security.spec.KeySpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.ProjectSettingsRepository;

import jakarta.annotation.PostConstruct;

@Service
public class AdminSecurityService {

    private static final String CLAIMED = "adminSecurityClaimed";
    private static final String LEGACY_SETUP_CODE = "adminSecuritySetupCode";
    private static final String SETUP_CODE_HASH = "adminSecuritySetupCodeHash";
    private static final String PASSWORD_HASH = "adminSecurityPasswordHash";
    private static final String PASSWORD_SALT = "adminSecurityPasswordSalt";
    private static final String UPDATED_AT = "adminSecurityUpdatedAt";
    private static final int MIN_PASSWORD_LENGTH = 12;
    private static final String SETUP_CODE_COMMAND = "sudo autark-os admin setup-code";
    private static final String PASSWORD_RESET_COMMAND = "sudo autark-os admin reset-password";

    private final ProjectSettingsRepository repository;
    private final AdminLocalCredentialStore localCredentialStore;
    private final ActivityLogService activityLogService;
    private final boolean devMode;
    private final Clock clock;
    private final Duration idleTimeout;
    private final Duration absoluteLifetime;
    private final Duration attemptWindow;
    private final Duration lockoutDuration;
    private final int maximumAttempts;
    private final SecureRandom random = new SecureRandom();
    private final ConcurrentHashMap<String, SessionRecord> sessions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, AttemptState> attempts = new ConcurrentHashMap<>();

    @Autowired
    public AdminSecurityService(
            ProjectSettingsRepository repository,
            AdminLocalCredentialStore localCredentialStore,
            ActivityLogService activityLogService,
            @Value("${autark-os.dev-mode:false}") boolean devMode,
            @Value("${autark-os.security.session.idle-timeout-minutes:30}") long idleTimeoutMinutes,
            @Value("${autark-os.security.session.absolute-lifetime-minutes:720}") long absoluteLifetimeMinutes,
            @Value("${autark-os.security.attempts.window-seconds:300}") long attemptWindowSeconds,
            @Value("${autark-os.security.attempts.lockout-seconds:900}") long lockoutSeconds,
            @Value("${autark-os.security.attempts.maximum:5}") int maximumAttempts) {
        this(
                repository,
                localCredentialStore,
                activityLogService,
                devMode,
                Clock.systemUTC(),
                Duration.ofMinutes(Math.max(1, idleTimeoutMinutes)),
                Duration.ofMinutes(Math.max(1, absoluteLifetimeMinutes)),
                Duration.ofSeconds(Math.max(1, attemptWindowSeconds)),
                Duration.ofSeconds(Math.max(1, lockoutSeconds)),
                Math.max(1, maximumAttempts));
    }

    public AdminSecurityService(ProjectSettingsRepository repository, RuntimeLayout runtimeLayout, boolean devMode) {
        this(
                repository,
                new AdminLocalCredentialStore(runtimeLayout),
                null,
                devMode,
                Clock.systemUTC(),
                Duration.ofMinutes(30),
                Duration.ofHours(12),
                Duration.ofMinutes(5),
                Duration.ofMinutes(15),
                5);
    }

    AdminSecurityService(
            ProjectSettingsRepository repository,
            AdminLocalCredentialStore localCredentialStore,
            ActivityLogService activityLogService,
            boolean devMode,
            Clock clock,
            Duration idleTimeout,
            Duration absoluteLifetime,
            Duration attemptWindow,
            Duration lockoutDuration,
            int maximumAttempts) {
        this.repository = repository;
        this.localCredentialStore = localCredentialStore;
        this.activityLogService = activityLogService;
        this.devMode = devMode;
        this.clock = clock;
        this.idleTimeout = idleTimeout;
        this.absoluteLifetime = absoluteLifetime;
        this.attemptWindow = attemptWindow;
        this.lockoutDuration = lockoutDuration;
        this.maximumAttempts = maximumAttempts;
    }

    @PostConstruct
    public void initialize() {
        if (!devMode) {
            ensureLocalCredentials();
        }
    }

    public AdminSecurityStatus status() {
        if (devMode) {
            return new AdminSecurityStatus(true, true, false, "Dev mode is active. Admin login is disabled for local development.", "", "");
        }
        ensureLocalCredentials();
        boolean claimed = claimed(repository.readAll());
        String message = claimed
                ? "Log in with the administrator password for this Autark-OS appliance."
                : "Get the setup code from the server, then create the administrator password.";
        return new AdminSecurityStatus(false, claimed, true, message, SETUP_CODE_COMMAND, PASSWORD_RESET_COMMAND);
    }

    public AdminSecuritySession claim(AdminClaimRequest request) {
        return claim(request, "unspecified");
    }

    public synchronized AdminSecuritySession claim(AdminClaimRequest request, String clientId) {
        if (devMode) {
            return issueSession("Dev mode does not require admin login.");
        }
        ensureLocalCredentials();
        Map<String, String> values = repository.readAll();
        if (claimed(values)) {
            return AdminSecuritySession.denied("Autark-OS has already been claimed. Log in instead.");
        }
        AdminSecuritySession limited = rateLimitResult("claim", clientId);
        if (limited != null) {
            return limited;
        }
        String submittedCode = request == null ? "" : normalizeSetupCode(request.setupCode());
        String submittedPassword = request == null || request.password() == null ? "" : request.password();
        String expectedHash = values.getOrDefault(SETUP_CODE_HASH, "");
        if (submittedPassword.length() < MIN_PASSWORD_LENGTH
                || expectedHash.isBlank()
                || !constantEquals(expectedHash, hashSetupCode(submittedCode))) {
            return failedAttempt("claim", clientId, "The claim request was not accepted. Check the local setup code and password requirements.");
        }

        String salt = randomToken(24);
        repository.saveValues(Map.of(
                CLAIMED, "true",
                LEGACY_SETUP_CODE, "",
                SETUP_CODE_HASH, "",
                PASSWORD_SALT, salt,
                PASSWORD_HASH, hashPassword(submittedPassword, salt),
                UPDATED_AT, now().toString()));
        localCredentialStore.clearSetupCode();
        clearAttempts("claim", clientId);
        recordSuccess("admin_claimed", "Administrator setup completed", "This Autark-OS appliance was claimed from a local setup code.");
        return issueSession("Autark-OS administrator setup is complete.");
    }

    public AdminSecuritySession login(AdminLoginRequest request) {
        return login(request, "unspecified");
    }

    public synchronized AdminSecuritySession login(AdminLoginRequest request, String clientId) {
        if (devMode) {
            return issueSession("Dev mode does not require admin login.");
        }
        Map<String, String> values = repository.readAll();
        if (!claimed(values)) {
            return AdminSecuritySession.denied("Claim this Autark-OS install before logging in.");
        }
        AdminSecuritySession limited = rateLimitResult("login", clientId);
        if (limited != null) {
            return limited;
        }
        String password = request == null || request.password() == null ? "" : request.password();
        String salt = values.getOrDefault(PASSWORD_SALT, "");
        String expectedHash = values.getOrDefault(PASSWORD_HASH, "");
        if (salt.isBlank() || expectedHash.isBlank() || !constantEquals(expectedHash, hashPassword(password, salt))) {
            return failedAttempt("login", clientId, "The administrator password was not accepted.");
        }
        clearAttempts("login", clientId);
        return issueSession("Logged in to Autark-OS.");
    }

    public AdminSecuritySession session(String token) {
        if (devMode) {
            return new AdminSecuritySession(true, "", "Dev mode session is active.", now().plus(absoluteLifetime).toString(), 0);
        }
        if (token == null || token.isBlank()) {
            return AdminSecuritySession.denied("Administrator login is required.");
        }
        String key = tokenHash(token);
        Instant current = now();
        SessionRecord record = sessions.computeIfPresent(key, (ignored, existing) -> {
            if (existing.expiredAt(current, idleTimeout)) {
                return null;
            }
            return existing.usedAt(current);
        });
        if (record == null) {
            return AdminSecuritySession.denied("Administrator session has expired. Log in again.");
        }
        Instant expiresAt = earlier(record.absoluteExpiresAt(), record.lastUsedAt().plus(idleTimeout));
        return new AdminSecuritySession(true, "", "Administrator session is active.", expiresAt.toString(), 0);
    }

    public boolean authenticate(String token) {
        return session(token).authorized();
    }

    public boolean authenticateLocalRequest(String remoteAddress, String localSecret) {
        return isLoopback(remoteAddress) && localCredentialStore.matchesLocalSecret(localSecret);
    }

    public void logout(String token) {
        if (token != null && !token.isBlank()) {
            sessions.remove(tokenHash(token));
        }
    }

    public synchronized AdminSecurityActionResult resetPassword(AdminPasswordResetRequest request) {
        if (devMode) {
            return new AdminSecurityActionResult(true, "info", "Development mode is active", "No administrator password is required in development mode.", now());
        }
        String password = request == null || request.password() == null ? "" : request.password();
        if (password.length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalArgumentException("Use an administrator password with at least 12 characters.");
        }
        String salt = randomToken(24);
        repository.saveValues(Map.of(
                CLAIMED, "true",
                LEGACY_SETUP_CODE, "",
                SETUP_CODE_HASH, "",
                PASSWORD_SALT, salt,
                PASSWORD_HASH, hashPassword(password, salt),
                UPDATED_AT, now().toString()));
        localCredentialStore.clearSetupCode();
        sessions.clear();
        attempts.clear();
        recordSuccess("admin_password_reset", "Administrator password reset", "The local root recovery command reset the administrator password and revoked active sessions.");
        return new AdminSecurityActionResult(true, "success", "Administrator password reset", "Log in again with the new password. Existing apps, settings, and backups were preserved.", now());
    }

    long absoluteLifetimeSeconds() {
        return absoluteLifetime.toSeconds();
    }

    private synchronized void ensureLocalCredentials() {
        localCredentialStore.ensureLocalSecret();
        Map<String, String> values = repository.readAll();
        if (claimed(values)) {
            localCredentialStore.clearSetupCode();
            return;
        }
        String setupHash = values.getOrDefault(SETUP_CODE_HASH, "");
        if (!setupHash.isBlank() && localCredentialStore.setupCodeExists()) {
            return;
        }
        String setupCode = randomSetupCode();
        localCredentialStore.writeSetupCode(setupCode);
        repository.saveValues(Map.of(
                CLAIMED, "false",
                LEGACY_SETUP_CODE, "",
                SETUP_CODE_HASH, hashSetupCode(normalizeSetupCode(setupCode)),
                UPDATED_AT, now().toString()));
    }

    private AdminSecuritySession issueSession(String message) {
        String token = randomToken(32);
        Instant issuedAt = now();
        Instant absoluteExpiresAt = issuedAt.plus(absoluteLifetime);
        sessions.put(tokenHash(token), new SessionRecord(issuedAt, issuedAt, absoluteExpiresAt));
        Instant expiresAt = earlier(absoluteExpiresAt, issuedAt.plus(idleTimeout));
        return new AdminSecuritySession(true, token, message, expiresAt.toString(), 0);
    }

    private synchronized AdminSecuritySession rateLimitResult(String action, String clientId) {
        String key = attemptKey(action, clientId);
        AttemptState state = attempts.get(key);
        if (state == null || state.blockedUntil() == null || !state.blockedUntil().isAfter(now())) {
            return null;
        }
        return AdminSecuritySession.rateLimited("Too many administrator attempts. Wait before trying again.", secondsUntil(state.blockedUntil()));
    }

    private synchronized AdminSecuritySession failedAttempt(String action, String clientId, String message) {
        String key = attemptKey(action, clientId);
        Instant current = now();
        AttemptState state = attempts.get(key);
        if (state == null || state.windowStartedAt().plus(attemptWindow).isBefore(current)) {
            state = new AttemptState(current, 0, null);
        }
        int failures = state.failures() + 1;
        if (failures >= maximumAttempts) {
            Instant blockedUntil = current.plus(lockoutDuration);
            attempts.put(key, new AttemptState(current, failures, blockedUntil));
            recordWarning("admin_attempts_limited", "Administrator attempts temporarily limited", "Too many unsuccessful administrator attempts were received.");
            return AdminSecuritySession.rateLimited("Too many administrator attempts. Wait before trying again.", secondsUntil(blockedUntil));
        }
        attempts.put(key, new AttemptState(state.windowStartedAt(), failures, null));
        return AdminSecuritySession.denied(message);
    }

    private synchronized void clearAttempts(String action, String clientId) {
        attempts.remove(attemptKey(action, clientId));
    }

    private String attemptKey(String action, String clientId) {
        String safeClient = clientId == null || clientId.isBlank() ? "unknown" : clientId.trim();
        return action + ":" + safeClient.substring(0, Math.min(160, safeClient.length()));
    }

    private long secondsUntil(Instant instant) {
        return Math.max(1, Duration.between(now(), instant).toSeconds());
    }

    private boolean claimed(Map<String, String> values) {
        return Boolean.parseBoolean(values.getOrDefault(CLAIMED, "false"));
    }

    private String randomSetupCode() {
        byte[] value = new byte[12];
        random.nextBytes(value);
        String encoded = HexFormat.of().withUpperCase().formatHex(value);
        return encoded.replaceAll("(.{4})(?!$)", "$1-");
    }

    private String normalizeSetupCode(String value) {
        return value == null ? "" : value.replaceAll("[^A-Za-z0-9]", "").toUpperCase(java.util.Locale.ROOT);
    }

    private String hashSetupCode(String value) {
        return sha256("autark-os-admin-claim:" + value);
    }

    private String tokenHash(String value) {
        return sha256("autark-os-admin-session:" + value);
    }

    private String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new InstallationException("Autark-OS could not protect administrator credentials.", exception);
        }
    }

    private String randomToken(int bytes) {
        byte[] value = new byte[bytes];
        random.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private String hashPassword(String value, String salt) {
        try {
            KeySpec spec = new PBEKeySpec(value.toCharArray(), salt.getBytes(StandardCharsets.UTF_8), 120_000, 256);
            return Base64.getEncoder().encodeToString(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded());
        } catch (NoSuchAlgorithmException | InvalidKeySpecException exception) {
            throw new InstallationException("Unable to protect Autark-OS administrator credentials.", exception);
        }
    }

    private boolean constantEquals(String left, String right) {
        byte[] leftBytes = left == null ? new byte[0] : left.getBytes(StandardCharsets.UTF_8);
        byte[] rightBytes = right == null ? new byte[0] : right.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(leftBytes, rightBytes);
    }

    private boolean isLoopback(String remoteAddress) {
        if (remoteAddress == null || remoteAddress.isBlank()) {
            return false;
        }
        try {
            return InetAddress.getByName(remoteAddress).isLoopbackAddress();
        } catch (UnknownHostException exception) {
            return false;
        }
    }

    private Instant earlier(Instant first, Instant second) {
        return first.isBefore(second) ? first : second;
    }

    private Instant now() {
        return clock.instant();
    }

    private void recordSuccess(String action, String title, String message) {
        if (activityLogService != null) {
            activityLogService.success("security", action, title, message, null);
        }
    }

    private void recordWarning(String action, String title, String message) {
        if (activityLogService != null) {
            activityLogService.warning("security", action, title, message, null);
        }
    }

    private record SessionRecord(Instant issuedAt, Instant lastUsedAt, Instant absoluteExpiresAt) {
        boolean expiredAt(Instant now, Duration idleTimeout) {
            return !absoluteExpiresAt.isAfter(now) || !lastUsedAt.plus(idleTimeout).isAfter(now);
        }

        SessionRecord usedAt(Instant now) {
            return new SessionRecord(issuedAt, now, absoluteExpiresAt);
        }
    }

    private record AttemptState(Instant windowStartedAt, int failures, Instant blockedUntil) {
    }
}

package com.autarkos.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermission;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.runtime.RuntimeLayout;

@Component
public class AdminLocalCredentialStore {

    static final String SETUP_CODE_FILE_NAME = "admin-setup-code";
    static final String LOCAL_SECRET_FILE_NAME = "admin-local-secret";
    private static final Set<PosixFilePermission> PRIVATE_FILE_PERMISSIONS = Set.of(
            PosixFilePermission.OWNER_READ,
            PosixFilePermission.OWNER_WRITE);

    private final Path securityRoot;
    private final SecureRandom random = new SecureRandom();

    public AdminLocalCredentialStore(RuntimeLayout runtimeLayout) {
        this.securityRoot = runtimeLayout.configRoot();
    }

    synchronized void writeSetupCode(String setupCode) {
        writePrivateFile(setupCodePath(), setupCode + System.lineSeparator());
    }

    synchronized boolean setupCodeExists() {
        return Files.isRegularFile(setupCodePath());
    }

    synchronized void clearSetupCode() {
        try {
            Files.deleteIfExists(setupCodePath());
        } catch (IOException exception) {
            throw new InstallationException("Autark-OS could not remove the local admin setup code.", exception);
        }
    }

    synchronized void ensureLocalSecret() {
        if (Files.isRegularFile(localSecretPath())) {
            enforcePrivatePermissions(localSecretPath());
            return;
        }
        byte[] value = new byte[32];
        random.nextBytes(value);
        writePrivateFile(localSecretPath(), Base64.getUrlEncoder().withoutPadding().encodeToString(value) + System.lineSeparator());
    }

    synchronized boolean matchesLocalSecret(String candidate) {
        ensureLocalSecret();
        try {
            String expected = Files.readString(localSecretPath(), StandardCharsets.UTF_8).trim();
            byte[] expectedBytes = expected.getBytes(StandardCharsets.UTF_8);
            byte[] candidateBytes = candidate == null ? new byte[0] : candidate.trim().getBytes(StandardCharsets.UTF_8);
            return MessageDigest.isEqual(expectedBytes, candidateBytes);
        } catch (IOException exception) {
            return false;
        }
    }

    Path setupCodePath() {
        return securityRoot.resolve(SETUP_CODE_FILE_NAME).normalize();
    }

    Path localSecretPath() {
        return securityRoot.resolve(LOCAL_SECRET_FILE_NAME).normalize();
    }

    private void writePrivateFile(Path target, String value) {
        try {
            Files.createDirectories(securityRoot);
            Path temporary = Files.createTempFile(securityRoot, target.getFileName().toString(), ".tmp");
            enforcePrivatePermissions(temporary);
            Files.writeString(temporary, value, StandardCharsets.UTF_8);
            try {
                Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException exception) {
                Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING);
            }
            enforcePrivatePermissions(target);
        } catch (IOException exception) {
            throw new InstallationException("Autark-OS could not prepare local administrator credentials.", exception);
        }
    }

    private void enforcePrivatePermissions(Path path) {
        try {
            Files.setPosixFilePermissions(path, PRIVATE_FILE_PERMISSIONS);
        } catch (UnsupportedOperationException ignored) {
            // Non-POSIX development filesystems do not expose Unix modes.
        } catch (IOException exception) {
            throw new InstallationException("Autark-OS could not protect local administrator credentials.", exception);
        }
    }
}

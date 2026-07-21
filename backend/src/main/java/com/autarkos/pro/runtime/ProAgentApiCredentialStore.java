package com.autarkos.pro.runtime;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermission;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.Objects;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.pro.module.ProModuleException;

@Component
public class ProAgentApiCredentialStore {

    private static final int RANDOM_BYTES = 32;
    private static final int ENCODED_BYTES = 43;
    private static final Set<PosixFilePermission> PRIVATE_DIRECTORY =
            Set.of(
                    PosixFilePermission.OWNER_READ,
                    PosixFilePermission.OWNER_WRITE,
                    PosixFilePermission.OWNER_EXECUTE);
    /*
     * Docker preserves the host file's numeric ownership in a bind mount. The
     * containing host directory is owner-only, while the exact mounted file is
     * read-only and readable by the fixed unprivileged container UID.
     */
    private static final Set<PosixFilePermission> MOUNTABLE_SECRET =
            Set.of(
                    PosixFilePermission.OWNER_READ,
                    PosixFilePermission.OTHERS_READ);

    private final Path credentialPath;
    private final SecureRandom random;

    @Autowired
    public ProAgentApiCredentialStore(RuntimeLayout runtimeLayout) {
        this(
                runtimeLayout.proAgentApiCredentialPath(),
                new SecureRandom());
    }

    ProAgentApiCredentialStore(
            Path credentialPath,
            SecureRandom random) {
        this.credentialPath = Objects.requireNonNull(credentialPath)
                .toAbsolutePath()
                .normalize();
        this.random = Objects.requireNonNull(random);
    }

    public synchronized Path prepareMount() {
        if (Files.exists(credentialPath, LinkOption.NOFOLLOW_LINKS)) {
            validateExisting();
            return credentialPath;
        }
        Path temporary = null;
        byte[] randomBytes = new byte[RANDOM_BYTES];
        byte[] encoded = null;
        try {
            ensurePrivateDirectories();
            random.nextBytes(randomBytes);
            encoded = Base64.getUrlEncoder()
                    .withoutPadding()
                    .encode(randomBytes);
            if (encoded.length != ENCODED_BYTES) {
                throw unavailable();
            }
            temporary = Files.createTempFile(
                    credentialPath.getParent(),
                    ".agent-api-token-",
                    ".tmp");
            Files.setPosixFilePermissions(
                    temporary,
                    Set.of(
                            PosixFilePermission.OWNER_READ,
                            PosixFilePermission.OWNER_WRITE));
            Files.write(
                    temporary,
                    encoded,
                    StandardOpenOption.TRUNCATE_EXISTING,
                    StandardOpenOption.WRITE);
            Files.setPosixFilePermissions(
                    temporary,
                    MOUNTABLE_SECRET);
            Files.move(
                    temporary,
                    credentialPath,
                    StandardCopyOption.ATOMIC_MOVE);
            temporary = null;
            validateExisting();
            return credentialPath;
        } catch (IOException | RuntimeException exception) {
            if (exception instanceof ProModuleException moduleException) {
                throw moduleException;
            }
            throw unavailable(exception);
        } finally {
            Arrays.fill(randomBytes, (byte) 0);
            if (encoded != null) {
                Arrays.fill(encoded, (byte) 0);
            }
            deleteQuietly(temporary);
        }
    }

    public synchronized <T, E extends Exception> T useSecret(
            SecretOperation<T, E> operation) throws E {
        Objects.requireNonNull(operation);
        prepareMount();
        byte[] bytes = null;
        char[] characters = null;
        try {
            bytes = Files.readAllBytes(credentialPath);
            validateBytes(bytes);
            characters = new char[bytes.length];
            for (int index = 0; index < bytes.length; index++) {
                characters[index] = (char) (bytes[index] & 0xff);
            }
            return operation.apply(characters);
        } catch (IOException exception) {
            throw unavailable(exception);
        } finally {
            if (bytes != null) {
                Arrays.fill(bytes, (byte) 0);
            }
            if (characters != null) {
                Arrays.fill(characters, '\0');
            }
        }
    }

    public synchronized void delete() {
        try {
            Files.deleteIfExists(credentialPath);
        } catch (IOException exception) {
            throw new ProModuleException(
                    "agent_credential_cleanup_failed",
                    "Autark Pro could not remove its local API credential.",
                    exception);
        }
    }

    Path credentialPath() {
        return credentialPath;
    }

    private void validateExisting() {
        try {
            ensurePrivateDirectories();
            if (Files.isSymbolicLink(credentialPath)
                    || !Files.isRegularFile(
                            credentialPath,
                            LinkOption.NOFOLLOW_LINKS)
                    || !MOUNTABLE_SECRET.equals(
                            Files.getPosixFilePermissions(
                                    credentialPath,
                                    LinkOption.NOFOLLOW_LINKS))) {
                throw unavailable();
            }
            byte[] bytes = Files.readAllBytes(credentialPath);
            try {
                validateBytes(bytes);
            } finally {
                Arrays.fill(bytes, (byte) 0);
            }
        } catch (IOException exception) {
            throw unavailable(exception);
        }
    }

    private void ensurePrivateDirectories() throws IOException {
        Path agentRoot = credentialPath.getParent().getParent();
        ensurePrivateDirectory(agentRoot);
        ensurePrivateDirectory(credentialPath.getParent());
    }

    private static void ensurePrivateDirectory(Path directory)
            throws IOException {
        if (Files.exists(directory, LinkOption.NOFOLLOW_LINKS)) {
            if (Files.isSymbolicLink(directory)
                    || !Files.isDirectory(
                            directory,
                            LinkOption.NOFOLLOW_LINKS)
                    || !PRIVATE_DIRECTORY.equals(
                            Files.getPosixFilePermissions(
                                    directory,
                                    LinkOption.NOFOLLOW_LINKS))) {
                throw unavailable();
            }
            return;
        }
        Files.createDirectory(directory);
        Files.setPosixFilePermissions(directory, PRIVATE_DIRECTORY);
    }

    private static void validateBytes(byte[] bytes) {
        if (bytes == null || bytes.length != ENCODED_BYTES) {
            throw unavailable();
        }
        for (byte value : bytes) {
            boolean valid = value >= 'A' && value <= 'Z'
                    || value >= 'a' && value <= 'z'
                    || value >= '0' && value <= '9'
                    || value == '-'
                    || value == '_';
            if (!valid) {
                throw unavailable();
            }
        }
    }

    private static ProModuleException unavailable() {
        return new ProModuleException(
                "agent_credential_unavailable",
                "Autark Pro local API credential is unavailable.");
    }

    private static ProModuleException unavailable(Throwable cause) {
        return new ProModuleException(
                "agent_credential_unavailable",
                "Autark Pro local API credential is unavailable.",
                cause);
    }

    private static void deleteQuietly(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // A later validation fails closed without exposing secret data.
        }
    }

    @FunctionalInterface
    public interface SecretOperation<T, E extends Exception> {

        T apply(char[] secret) throws E;
    }
}

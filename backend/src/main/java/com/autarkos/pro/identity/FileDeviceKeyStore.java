package com.autarkos.pro.identity;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermission;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class FileDeviceKeyStore implements DeviceKeyStore {

    static final String SCHEMA_VERSION = "1";
    static final String ALGORITHM = "Ed25519";
    private static final int MAXIMUM_IDENTITY_BYTES = 32 * 1024;
    private static final byte[] ED25519_SPKI_PREFIX = HexFormat.of()
            .parseHex("302a300506032b6570032100");
    private static final byte[] KEY_VALIDATION_MESSAGE =
            "autark-pro-device-key-validation-v1".getBytes(StandardCharsets.UTF_8);
    private static final Set<PosixFilePermission> PRIVATE_FILE_PERMISSIONS = Set.of(
            PosixFilePermission.OWNER_READ,
            PosixFilePermission.OWNER_WRITE);
    private static final Set<PosixFilePermission> PRIVATE_DIRECTORY_PERMISSIONS = Set.of(
            PosixFilePermission.OWNER_READ,
            PosixFilePermission.OWNER_WRITE,
            PosixFilePermission.OWNER_EXECUTE);

    private final Path identityPath;
    private final Path lockPath;
    private final Clock clock;
    private final Supplier<String> deviceIdSupplier;
    private final Supplier<String> installationIdSupplier;
    private final Supplier<KeyPair> keyPairSupplier;
    private final ObjectMapper objectMapper;

    @Autowired
    public FileDeviceKeyStore(RuntimeLayout runtimeLayout) {
        this(
                runtimeLayout.proDeviceIdentityPath(),
                Clock.systemUTC(),
                FileDeviceKeyStore::randomId,
                FileDeviceKeyStore::randomId,
                FileDeviceKeyStore::generateKeyPair);
    }

    FileDeviceKeyStore(
            Path identityPath,
            Clock clock,
            Supplier<String> deviceIdSupplier,
            Supplier<String> installationIdSupplier,
            Supplier<KeyPair> keyPairSupplier) {
        this.identityPath = identityPath.toAbsolutePath().normalize();
        this.lockPath = this.identityPath.resolveSibling("device-identity.lock");
        this.clock = clock;
        this.deviceIdSupplier = deviceIdSupplier;
        this.installationIdSupplier = installationIdSupplier;
        this.keyPairSupplier = keyPairSupplier;
        this.objectMapper = new ObjectMapper()
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    }

    @Override
    public synchronized void validateExisting() {
        if (!Files.exists(identityPath, LinkOption.NOFOLLOW_LINKS)) {
            return;
        }
        withLock(this::readExisting);
    }

    @Override
    public synchronized DeviceKeyHandle loadOrCreate() {
        return withLock(() -> {
            if (Files.exists(identityPath, LinkOption.NOFOLLOW_LINKS)) {
                return readExisting();
            }
            StoredDeviceIdentity generated = createStoredIdentity();
            FileDeviceKeyHandle handle = materialize(generated);
            writeAtomically(generated, false);
            return handle;
        });
    }

    @Override
    public synchronized DeviceKeyHandle rotateInstallationIdentity() {
        return withLock(() -> {
            StoredDeviceIdentity current = readStoredIdentity();
            materialize(current);
            String replacement = requireRandomId(installationIdSupplier.get(), "installation ID");
            if (replacement.equals(current.deviceId()) || replacement.equals(current.installationId())) {
                throw recoveryError("could not generate a distinct replacement installation ID");
            }
            Instant replacementTime = clock.instant();
            Instant previousUpdate = Instant.parse(current.updatedAt());
            if (replacementTime.isBefore(previousUpdate)) {
                replacementTime = previousUpdate;
            }
            StoredDeviceIdentity rotated = current.withInstallationId(
                    replacement,
                    replacementTime.toString());
            FileDeviceKeyHandle handle = materialize(rotated);
            writeAtomically(rotated, true);
            return handle;
        });
    }

    Path identityPath() {
        return identityPath;
    }

    private DeviceKeyHandle readExisting() {
        return materialize(readStoredIdentity());
    }

    private StoredDeviceIdentity readStoredIdentity() {
        requireRegularIdentityFile();
        requirePrivatePermissions(identityPath);
        try {
            long size = Files.size(identityPath);
            if (size <= 0 || size > MAXIMUM_IDENTITY_BYTES) {
                throw recoveryError("has an invalid size");
            }
            return objectMapper.readValue(Files.readString(identityPath, StandardCharsets.UTF_8), StoredDeviceIdentity.class);
        } catch (DeviceIdentityException exception) {
            throw exception;
        } catch (IOException | RuntimeException exception) {
            throw recoveryError("is unreadable or corrupt", exception);
        }
    }

    private StoredDeviceIdentity createStoredIdentity() {
        KeyPair keyPair = keyPairSupplier.get();
        Instant now = clock.instant();
        String publicKey = Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded());
        String privateKey = Base64.getEncoder().encodeToString(keyPair.getPrivate().getEncoded());
        String publicKeyX = publicKeyX(keyPair.getPublic());
        String fingerprint = fingerprint(keyPair.getPublic());
        return new StoredDeviceIdentity(
                SCHEMA_VERSION,
                requireRandomId(deviceIdSupplier.get(), "device ID"),
                requireRandomId(installationIdSupplier.get(), "installation ID"),
                ALGORITHM,
                keyId(fingerprint),
                publicKeyX,
                fingerprint,
                publicKey,
                privateKey,
                now.toString(),
                now.toString());
    }

    private FileDeviceKeyHandle materialize(StoredDeviceIdentity stored) {
        try {
            validateStoredMetadata(stored);
            KeyFactory keyFactory = KeyFactory.getInstance(ALGORITHM);
            PublicKey publicKey = keyFactory.generatePublic(new X509EncodedKeySpec(
                    decodeStandardBase64(stored.publicKeyX509(), "public key")));
            PrivateKey privateKey = keyFactory.generatePrivate(new PKCS8EncodedKeySpec(
                    decodeStandardBase64(stored.privateKeyPkcs8(), "private key")));
            validateKeyPair(stored, publicKey, privateKey);
            DeviceIdentity publicIdentity = new DeviceIdentity(
                    stored.schemaVersion(),
                    stored.deviceId(),
                    stored.installationId(),
                    stored.algorithm(),
                    stored.keyId(),
                    new DevicePublicKey("OKP", ALGORITHM, stored.publicKeyX()),
                    stored.publicKeyFingerprint(),
                    Instant.parse(stored.createdAt()),
                    Instant.parse(stored.updatedAt()));
            return new FileDeviceKeyHandle(publicIdentity, privateKey);
        } catch (DeviceIdentityException exception) {
            throw exception;
        } catch (GeneralSecurityException | RuntimeException exception) {
            throw recoveryError("contains invalid cryptographic material", exception);
        }
    }

    private void validateStoredMetadata(StoredDeviceIdentity stored) {
        if (stored == null
                || !SCHEMA_VERSION.equals(stored.schemaVersion())
                || !ALGORITHM.equals(stored.algorithm())
                || isBlank(stored.keyId())
                || isBlank(stored.publicKeyX())
                || isBlank(stored.publicKeyFingerprint())
                || isBlank(stored.publicKeyX509())
                || isBlank(stored.privateKeyPkcs8())
                || isBlank(stored.createdAt())
                || isBlank(stored.updatedAt())) {
            throw recoveryError("is incomplete or uses an unsupported schema");
        }
        UUID deviceId = parseVersionFourId(stored.deviceId(), "device ID");
        UUID installationId = parseVersionFourId(stored.installationId(), "installation ID");
        if (deviceId.equals(installationId)) {
            throw recoveryError("contains duplicate device and installation IDs");
        }
        Instant createdAt = Instant.parse(stored.createdAt());
        Instant updatedAt = Instant.parse(stored.updatedAt());
        if (updatedAt.isBefore(createdAt)) {
            throw recoveryError("contains an invalid update timestamp");
        }
    }

    private void validateKeyPair(StoredDeviceIdentity stored, PublicKey publicKey, PrivateKey privateKey)
            throws GeneralSecurityException {
        String expectedX = publicKeyX(publicKey);
        String expectedFingerprint = fingerprint(publicKey);
        if (!MessageDigest.isEqual(
                expectedX.getBytes(StandardCharsets.US_ASCII),
                stored.publicKeyX().getBytes(StandardCharsets.US_ASCII))
                || !MessageDigest.isEqual(
                        expectedFingerprint.getBytes(StandardCharsets.US_ASCII),
                        stored.publicKeyFingerprint().getBytes(StandardCharsets.US_ASCII))
                || !MessageDigest.isEqual(
                        keyId(expectedFingerprint).getBytes(StandardCharsets.US_ASCII),
                        stored.keyId().getBytes(StandardCharsets.US_ASCII))) {
            throw recoveryError("contains mismatched public identity metadata");
        }
        byte[] proof = sign(privateKey, KEY_VALIDATION_MESSAGE);
        Signature verifier = Signature.getInstance(ALGORITHM);
        verifier.initVerify(publicKey);
        verifier.update(KEY_VALIDATION_MESSAGE);
        if (!verifier.verify(proof)) {
            throw recoveryError("contains a mismatched key pair");
        }
    }

    private void writeAtomically(StoredDeviceIdentity stored, boolean replaceExisting) {
        Path temporary = null;
        try {
            ensurePrivateDirectory();
            temporary = Files.createTempFile(identityPath.getParent(), ".device-identity-", ".tmp");
            setPrivatePermissions(temporary);
            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(stored)
                    + System.lineSeparator();
            Files.writeString(
                    temporary,
                    json,
                    StandardCharsets.UTF_8,
                    StandardOpenOption.TRUNCATE_EXISTING,
                    StandardOpenOption.WRITE);
            move(temporary, identityPath, replaceExisting);
            temporary = null;
            requirePrivatePermissions(identityPath);
        } catch (IOException exception) {
            throw recoveryError(replaceExisting ? "could not be updated" : "could not be created", exception);
        } finally {
            if (temporary != null) {
                try {
                    Files.deleteIfExists(temporary);
                } catch (IOException ignored) {
                    // The original failure is more useful and contains no key material.
                }
            }
        }
    }

    private void move(Path source, Path target, boolean replaceExisting) throws IOException {
        StandardCopyOption[] atomicOptions = replaceExisting
                ? new StandardCopyOption[] {StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING}
                : new StandardCopyOption[] {StandardCopyOption.ATOMIC_MOVE};
        StandardCopyOption[] fallbackOptions = replaceExisting
                ? new StandardCopyOption[] {StandardCopyOption.REPLACE_EXISTING}
                : new StandardCopyOption[] {};
        try {
            Files.move(source, target, atomicOptions);
        } catch (AtomicMoveNotSupportedException exception) {
            Files.move(source, target, fallbackOptions);
        }
    }

    private <T> T withLock(Supplier<T> operation) {
        ensurePrivateDirectory();
        try (FileChannel channel = FileChannel.open(
                lockPath,
                StandardOpenOption.CREATE,
                StandardOpenOption.WRITE);
                FileLock ignored = channel.lock()) {
            setPrivatePermissions(lockPath);
            return operation.get();
        } catch (DeviceIdentityException exception) {
            throw exception;
        } catch (IOException exception) {
            throw recoveryError("could not acquire its local identity lock", exception);
        }
    }

    private void ensurePrivateDirectory() {
        try {
            Path parent = identityPath.getParent();
            if (Files.exists(parent, LinkOption.NOFOLLOW_LINKS) && Files.isSymbolicLink(parent)) {
                throw recoveryError("configuration directory cannot be a symbolic link");
            }
            boolean created = Files.notExists(parent, LinkOption.NOFOLLOW_LINKS);
            Files.createDirectories(parent);
            if (created) {
                try {
                    Files.setPosixFilePermissions(parent, PRIVATE_DIRECTORY_PERMISSIONS);
                } catch (UnsupportedOperationException ignored) {
                    // Non-POSIX development filesystems do not expose Unix modes.
                }
            }
        } catch (DeviceIdentityException exception) {
            throw exception;
        } catch (IOException exception) {
            throw recoveryError("configuration directory could not be prepared", exception);
        }
    }

    private void requireRegularIdentityFile() {
        if (Files.isSymbolicLink(identityPath)
                || !Files.isRegularFile(identityPath, LinkOption.NOFOLLOW_LINKS)) {
            throw recoveryError("is not a regular owner-controlled file");
        }
    }

    private void requirePrivatePermissions(Path path) {
        try {
            Set<PosixFilePermission> permissions = Files.getPosixFilePermissions(path, LinkOption.NOFOLLOW_LINKS);
            if (!permissions.equals(PRIVATE_FILE_PERMISSIONS)) {
                throw recoveryError("must have mode 0600; refusing to use broader permissions");
            }
        } catch (UnsupportedOperationException ignored) {
            // Non-POSIX development filesystems do not expose Unix modes.
        } catch (IOException exception) {
            throw recoveryError("permissions could not be verified", exception);
        }
    }

    private void setPrivatePermissions(Path path) throws IOException {
        try {
            Files.setPosixFilePermissions(path, PRIVATE_FILE_PERMISSIONS);
        } catch (UnsupportedOperationException ignored) {
            // Non-POSIX development filesystems do not expose Unix modes.
        }
    }

    private static String publicKeyX(PublicKey publicKey) {
        byte[] encoded = publicKey.getEncoded();
        if (encoded.length != ED25519_SPKI_PREFIX.length + 32
                || !Arrays.equals(
                        Arrays.copyOf(encoded, ED25519_SPKI_PREFIX.length),
                        ED25519_SPKI_PREFIX)) {
            throw new DeviceIdentityException("Autark Pro device identity uses an unsupported public key encoding.");
        }
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(Arrays.copyOfRange(encoded, ED25519_SPKI_PREFIX.length, encoded.length));
    }

    private static String fingerprint(PublicKey publicKey) {
        try {
            return "sha256:" + HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(publicKey.getEncoded()));
        } catch (GeneralSecurityException exception) {
            throw new DeviceIdentityException("Autark Pro could not fingerprint its device public key.", exception);
        }
    }

    private static String keyId(String fingerprint) {
        return "device-" + fingerprint.substring("sha256:".length(), "sha256:".length() + 24);
    }

    private static UUID parseVersionFourId(String value, String label) {
        try {
            UUID parsed = UUID.fromString(value);
            if (parsed.version() != 4) {
                throw recoveryErrorStatic("contains a non-random " + label);
            }
            return parsed;
        } catch (IllegalArgumentException exception) {
            throw recoveryErrorStatic("contains an invalid " + label, exception);
        }
    }

    private static String requireRandomId(String value, String label) {
        parseVersionFourId(value, label);
        return value;
    }

    private static byte[] decodeStandardBase64(String value, String label) {
        try {
            byte[] decoded = Base64.getDecoder().decode(value);
            if (!Base64.getEncoder().encodeToString(decoded).equals(value)) {
                throw recoveryErrorStatic("contains a non-canonical " + label);
            }
            return decoded;
        } catch (IllegalArgumentException exception) {
            throw recoveryErrorStatic("contains an invalid " + label, exception);
        }
    }

    private static byte[] sign(PrivateKey privateKey, byte[] challenge) {
        try {
            Signature signer = Signature.getInstance(ALGORITHM);
            signer.initSign(privateKey);
            signer.update(challenge);
            return signer.sign();
        } catch (GeneralSecurityException exception) {
            throw new DeviceIdentityException("Autark Pro device identity could not sign a challenge.", exception);
        }
    }

    private static KeyPair generateKeyPair() {
        try {
            return KeyPairGenerator.getInstance(ALGORITHM).generateKeyPair();
        } catch (GeneralSecurityException exception) {
            throw new DeviceIdentityException("Ed25519 is unavailable for Autark Pro device identity.", exception);
        }
    }

    private static String randomId() {
        return UUID.randomUUID().toString();
    }

    private DeviceIdentityException recoveryError(String detail) {
        return recoveryErrorStatic(detail);
    }

    private DeviceIdentityException recoveryError(String detail, Throwable cause) {
        return recoveryErrorStatic(detail, cause);
    }

    private static DeviceIdentityException recoveryErrorStatic(String detail) {
        return new DeviceIdentityException(
                "Autark Pro device identity " + detail
                        + ". Restore the protected identity file or use the documented local recovery process; "
                        + "a replacement key will not be generated automatically.");
    }

    private static DeviceIdentityException recoveryErrorStatic(String detail, Throwable cause) {
        return new DeviceIdentityException(
                "Autark Pro device identity " + detail
                        + ". Restore the protected identity file or use the documented local recovery process; "
                        + "a replacement key will not be generated automatically.",
                cause);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private record StoredDeviceIdentity(
            String schemaVersion,
            String deviceId,
            String installationId,
            String algorithm,
            String keyId,
            String publicKeyX,
            String publicKeyFingerprint,
            String publicKeyX509,
            String privateKeyPkcs8,
            String createdAt,
            String updatedAt) {

        StoredDeviceIdentity withInstallationId(String replacement, String replacementUpdatedAt) {
            return new StoredDeviceIdentity(
                    schemaVersion,
                    deviceId,
                    replacement,
                    algorithm,
                    keyId,
                    publicKeyX,
                    publicKeyFingerprint,
                    publicKeyX509,
                    privateKeyPkcs8,
                    createdAt,
                    replacementUpdatedAt);
        }
    }

    private static final class FileDeviceKeyHandle implements DeviceKeyHandle {

        private final DeviceIdentity publicIdentity;
        private final PrivateKey privateKey;

        private FileDeviceKeyHandle(DeviceIdentity publicIdentity, PrivateKey privateKey) {
            this.publicIdentity = publicIdentity;
            this.privateKey = privateKey;
        }

        @Override
        public DeviceIdentity publicIdentity() {
            return publicIdentity;
        }

        @Override
        public byte[] sign(byte[] challenge) {
            if (challenge == null || challenge.length == 0) {
                throw new IllegalArgumentException("Device challenges must not be empty.");
            }
            return FileDeviceKeyStore.sign(privateKey, challenge.clone());
        }
    }
}

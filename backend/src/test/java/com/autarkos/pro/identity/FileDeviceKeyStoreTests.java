package com.autarkos.pro.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

class FileDeviceKeyStoreTests {

    private static final String DEVICE_ID = "11111111-1111-4111-8111-111111111111";
    private static final String INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";
    private static final String ROTATED_INSTALLATION_ID = "33333333-3333-4333-8333-333333333333";
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-19T12:00:00Z"), ZoneOffset.UTC);
    private static final byte[] ED25519_SPKI_PREFIX = java.util.HexFormat.of()
            .parseHex("302a300506032b6570032100");

    @TempDir
    Path tempDir;

    @Test
    void startupValidationDoesNotCreateAnIdentityBeforeFirstUse() {
        FileDeviceKeyStore store = store(() -> DEVICE_ID, () -> INSTALLATION_ID, FileDeviceKeyStoreTests::keyPair);
        DefaultDeviceIdentityService service = new DefaultDeviceIdentityService(store);

        service.initialize();

        assertThat(Files.exists(store.identityPath())).isFalse();
    }

    @Test
    void firstAccessAtomicallyCreatesOneStableIdentityDuringConcurrency() throws Exception {
        AtomicInteger deviceIds = new AtomicInteger();
        AtomicInteger installationIds = new AtomicInteger();
        AtomicInteger keyPairs = new AtomicInteger();
        FileDeviceKeyStore store = store(
                () -> {
                    deviceIds.incrementAndGet();
                    return DEVICE_ID;
                },
                () -> {
                    installationIds.incrementAndGet();
                    return INSTALLATION_ID;
                },
                () -> {
                    keyPairs.incrementAndGet();
                    return keyPair();
                });
        var executor = Executors.newFixedThreadPool(12);

        try {
            List<CompletableFuture<DeviceIdentity>> calls = IntStream.range(0, 24)
                    .mapToObj(ignored -> CompletableFuture.supplyAsync(
                            () -> store.loadOrCreate().publicIdentity(),
                            executor))
                    .toList();
            List<DeviceIdentity> identities = calls.stream().map(CompletableFuture::join).toList();

            assertThat(identities).containsOnly(identities.getFirst());
            assertThat(deviceIds).hasValue(1);
            assertThat(installationIds).hasValue(1);
            assertThat(keyPairs).hasValue(1);
            assertThat(Files.readString(store.identityPath())).contains("\"privateKeyPkcs8\"");
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void restartPreservesIdsAndPublicKey() {
        FileDeviceKeyStore firstStore = store(() -> DEVICE_ID, () -> INSTALLATION_ID, FileDeviceKeyStoreTests::keyPair);
        DeviceIdentity first = firstStore.loadOrCreate().publicIdentity();
        FileDeviceKeyStore restartedStore = store(
                () -> "44444444-4444-4444-8444-444444444444",
                () -> "55555555-5555-4555-8555-555555555555",
                FileDeviceKeyStoreTests::keyPair);

        DeviceIdentity restarted = restartedStore.loadOrCreate().publicIdentity();

        assertThat(restarted).isEqualTo(first);
        assertThat(restarted.deviceId()).isEqualTo(DEVICE_ID);
        assertThat(restarted.installationId()).isEqualTo(INSTALLATION_ID);
    }

    @Test
    void privateFallbackFileIsOwnerOnlyAndPublicModelNeverSerializesPrivateKey() throws Exception {
        FileDeviceKeyStore store = store(() -> DEVICE_ID, () -> INSTALLATION_ID, FileDeviceKeyStoreTests::keyPair);
        DeviceIdentity identity = store.loadOrCreate().publicIdentity();
        Assumptions.assumeTrue(Files.getFileStore(store.identityPath()).supportsFileAttributeView("posix"));

        assertThat(Files.getPosixFilePermissions(store.identityPath()))
                .containsExactlyInAnyOrder(
                        PosixFilePermission.OWNER_READ,
                        PosixFilePermission.OWNER_WRITE);
        String serializedPublicIdentity = new ObjectMapper()
                .findAndRegisterModules()
                .writeValueAsString(identity);
        assertThat(serializedPublicIdentity)
                .contains(identity.deviceId(), identity.publicKey().x())
                .doesNotContain("privateKey", "pkcs8", "privateKeyPkcs8");
    }

    @Test
    void broaderExistingPermissionsFailClosedWithoutBeingRepaired() throws Exception {
        FileDeviceKeyStore store = store(() -> DEVICE_ID, () -> INSTALLATION_ID, FileDeviceKeyStoreTests::keyPair);
        store.loadOrCreate();
        Assumptions.assumeTrue(Files.getFileStore(store.identityPath()).supportsFileAttributeView("posix"));
        Set<PosixFilePermission> broad = Set.of(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.GROUP_READ);
        Files.setPosixFilePermissions(store.identityPath(), broad);

        DefaultDeviceIdentityService restartedService = new DefaultDeviceIdentityService(store);
        assertThatThrownBy(restartedService::initialize)
                .isInstanceOf(DeviceIdentityException.class)
                .hasMessageContaining("mode 0600")
                .hasMessageContaining("replacement key will not be generated");
        assertThat(Files.getPosixFilePermissions(store.identityPath())).isEqualTo(broad);
    }

    @Test
    void corruptIdentityFailsRecoveryWithoutGeneratingAReplacement() throws Exception {
        AtomicInteger generatedKeys = new AtomicInteger();
        FileDeviceKeyStore initial = store(() -> DEVICE_ID, () -> INSTALLATION_ID, FileDeviceKeyStoreTests::keyPair);
        initial.loadOrCreate();
        Files.writeString(initial.identityPath(), "{not-json", StandardCharsets.UTF_8);
        FileDeviceKeyStore restarted = store(
                () -> "44444444-4444-4444-8444-444444444444",
                () -> "55555555-5555-4555-8555-555555555555",
                () -> {
                    generatedKeys.incrementAndGet();
                    return keyPair();
                });

        assertThatThrownBy(restarted::loadOrCreate)
                .isInstanceOf(DeviceIdentityException.class)
                .hasMessageContaining("unreadable or corrupt")
                .hasMessageContaining("replacement key will not be generated");
        assertThat(generatedKeys).hasValue(0);
        assertThat(Files.readString(initial.identityPath())).isEqualTo("{not-json");
    }

    @Test
    void challengeSignaturesVerifyWithExposedEd25519PublicKey() throws Exception {
        FileDeviceKeyStore store = store(() -> DEVICE_ID, () -> INSTALLATION_ID, FileDeviceKeyStoreTests::keyPair);
        DefaultDeviceIdentityService service = new DefaultDeviceIdentityService(store);
        byte[] challenge = "control-plane-nonce-v1".getBytes(StandardCharsets.UTF_8);

        DeviceChallengeSignature proof = service.signChallenge(challenge);
        DeviceIdentity identity = service.current();
        Signature verifier = Signature.getInstance("Ed25519");
        verifier.initVerify(KeyFactory.getInstance("Ed25519").generatePublic(
                new X509EncodedKeySpec(spki(identity.publicKey().x()))));
        verifier.update(challenge);

        assertThat(proof.algorithm()).isEqualTo("Ed25519");
        assertThat(proof.keyId()).isEqualTo(identity.keyId());
        assertThat(verifier.verify(Base64.getUrlDecoder().decode(proof.signature()))).isTrue();
        assertThatThrownBy(() -> service.signChallenge(new byte[0]))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void explicitRotationChangesOnlyInstallationIdentityAndPersists() throws Exception {
        List<String> installationIds = new ArrayList<>(List.of(INSTALLATION_ID, ROTATED_INSTALLATION_ID));
        FileDeviceKeyStore store = store(
                () -> DEVICE_ID,
                () -> installationIds.removeFirst(),
                FileDeviceKeyStoreTests::keyPair);
        DefaultDeviceIdentityService service = new DefaultDeviceIdentityService(store);
        DeviceIdentity before = service.current();
        Map<String, Object> storedBefore = stored(store.identityPath());

        assertThatThrownBy(() -> service.rotateInstallationIdentity("WRONG"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(service.current()).isEqualTo(before);

        DeviceIdentity after = service.rotateInstallationIdentity(
                DefaultDeviceIdentityService.INSTALLATION_ROTATION_CONFIRMATION);
        Map<String, Object> storedAfter = stored(store.identityPath());

        assertThat(after.deviceId()).isEqualTo(before.deviceId());
        assertThat(after.installationId()).isEqualTo(ROTATED_INSTALLATION_ID);
        assertThat(after.publicKey()).isEqualTo(before.publicKey());
        assertThat(after.publicKeyFingerprint()).isEqualTo(before.publicKeyFingerprint());
        assertThat(after.keyId()).isEqualTo(before.keyId());
        assertThat(storedAfter.get("privateKeyPkcs8")).isEqualTo(storedBefore.get("privateKeyPkcs8"));
        assertThat(store.loadOrCreate().publicIdentity()).isEqualTo(after);
    }

    private FileDeviceKeyStore store(
            Supplier<String> deviceIdSupplier,
            Supplier<String> installationIdSupplier,
            Supplier<KeyPair> keyPairSupplier) {
        return new FileDeviceKeyStore(
                tempDir.resolve("runtime/config/pro/device-identity.json"),
                CLOCK,
                deviceIdSupplier,
                installationIdSupplier,
                keyPairSupplier);
    }

    private Map<String, Object> stored(Path path) throws Exception {
        return new ObjectMapper().readValue(path.toFile(), new TypeReference<>() {
        });
    }

    private static byte[] spki(String publicKeyX) {
        byte[] x = Base64.getUrlDecoder().decode(publicKeyX);
        byte[] encoded = new byte[ED25519_SPKI_PREFIX.length + x.length];
        System.arraycopy(ED25519_SPKI_PREFIX, 0, encoded, 0, ED25519_SPKI_PREFIX.length);
        System.arraycopy(x, 0, encoded, ED25519_SPKI_PREFIX.length, x.length);
        return encoded;
    }

    private static KeyPair keyPair() {
        try {
            return KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
}

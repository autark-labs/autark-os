package com.autarkos.pro.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.security.SecureRandom;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.pro.module.ProModuleException;

class ProAgentApiCredentialStoreTests {

    @TempDir
    Path directory;

    @Test
    void createsOneProtectedMountableCredentialAndReusesIt()
            throws Exception {
        Path credential = directory.resolve(
                "pro-agent/secrets/agent-api-token");
        ProAgentApiCredentialStore store =
                new ProAgentApiCredentialStore(
                        credential,
                        deterministicRandom());

        Path first = store.prepareMount();
        byte[] contents = read(first);
        Path second = store.prepareMount();

        assertThat(second).isEqualTo(first);
        assertThat(contents)
                .hasSize(43)
                .containsOnly((byte) 'A');
        assertThat(Files.getPosixFilePermissions(first))
                .isEqualTo(Set.of(
                        PosixFilePermission.OWNER_READ,
                        PosixFilePermission.OTHERS_READ));
        assertThat(Files.getPosixFilePermissions(
                        first.getParent()))
                .isEqualTo(Set.of(
                        PosixFilePermission.OWNER_READ,
                        PosixFilePermission.OWNER_WRITE,
                        PosixFilePermission.OWNER_EXECUTE));

        char[][] borrowed = new char[1][];
        store.useSecret(secret -> {
            borrowed[0] = secret;
            assertThat(secret).hasSize(43);
            return null;
        });
        assertThat(borrowed[0]).containsOnly('\0');

        store.delete();
        assertThat(first).doesNotExist();
    }

    @Test
    void broadPermissionsAndSymlinksFailClosed() throws Exception {
        Path credential = directory.resolve(
                "pro-agent/secrets/agent-api-token");
        ProAgentApiCredentialStore store =
                new ProAgentApiCredentialStore(
                        credential,
                        deterministicRandom());
        store.prepareMount();
        Files.setPosixFilePermissions(
                credential,
                Set.of(
                        PosixFilePermission.OWNER_READ,
                        PosixFilePermission.GROUP_READ,
                        PosixFilePermission.OTHERS_READ));

        assertThatThrownBy(store::prepareMount)
                .isInstanceOf(ProModuleException.class)
                .extracting(exception ->
                        ((ProModuleException) exception).code())
                .isEqualTo("agent_credential_unavailable");

        Files.delete(credential);
        Path target = directory.resolve("target");
        Files.writeString(target, "A".repeat(43));
        Files.createSymbolicLink(credential, target);
        assertThatThrownBy(store::prepareMount)
                .isInstanceOf(ProModuleException.class);
    }

    private static byte[] read(Path path) {
        try {
            return Files.readAllBytes(path);
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }

    private static SecureRandom deterministicRandom() {
        return new SecureRandom() {
            @Override
            public void nextBytes(byte[] bytes) {
                java.util.Arrays.fill(bytes, (byte) 0);
            }
        };
    }
}

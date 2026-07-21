package com.autarkos.pro.entitlement;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.pro.model.SignedEnvelopeV1;
import com.autarkos.testsupport.JpaTestRepositories;

class ProEntitlementRepositoryTests {

    @TempDir
    java.nio.file.Path runtimeRoot;

    @Test
    void persistsSignedDocumentsAndRefreshMetadataAcrossRepositoryReloads() {
        RuntimeLayout layout = runtimeLayout();
        ProEntitlementRepository first =
                JpaTestRepositories.proEntitlementRepository(layout);
        Instant createdAt = Instant.parse("2026-07-19T12:00:00Z");
        UUID registrationId =
                UUID.fromString("11111111-1111-4111-8111-111111111111");
        ProEntitlementCache expected = new ProEntitlementCache(
                registrationId,
                envelope("grant"),
                fingerprint('a'),
                "issuer-key-1",
                createdAt,
                envelope("lease"),
                fingerprint('b'),
                "issuer-key-1",
                createdAt.plusSeconds(1),
                createdAt.plusSeconds(2),
                createdAt.plusSeconds(3),
                createdAt.plusSeconds(4),
                "network",
                2,
                createdAt.plusSeconds(60),
                null,
                createdAt,
                createdAt.plusSeconds(5));

        first.save(expected);

        ProEntitlementRepository reloaded =
                JpaTestRepositories.proEntitlementRepository(layout);
        assertThat(reloaded.load()).contains(expected);
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private static SignedEnvelopeV1 envelope(String value) {
        return new SignedEnvelopeV1(
                value + "-payload",
                value + "-protected",
                value + "-signature");
    }

    private static String fingerprint(char value) {
        return "sha256:" + String.valueOf(value).repeat(64);
    }
}

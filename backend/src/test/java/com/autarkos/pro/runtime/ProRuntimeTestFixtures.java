package com.autarkos.pro.runtime;

import java.time.Instant;
import java.util.List;

import com.autarkos.pro.model.ProReleaseManifest;
import com.autarkos.pro.model.SignedEnvelopeV1;
import com.autarkos.pro.module.ProModuleCandidate;

final class ProRuntimeTestFixtures {

    static final String DIGEST = "sha256:" + "d".repeat(64);
    static final String PREVIOUS_DIGEST =
            "sha256:" + "a".repeat(64);
    static final String REPOSITORY =
            "registry.staging.autarklabs.com/autark-pro-agent";

    private ProRuntimeTestFixtures() {
    }

    static ProModuleCandidate candidate() {
        return new ProModuleCandidate(
                new ProReleaseManifest(
                        "1",
                        7,
                        Instant.parse("2026-07-19T12:00:00Z"),
                        Instant.parse("2026-07-19T12:10:00Z"),
                        "staging",
                        "autark-pro-agent",
                        "1.2.3",
                        REPOSITORY,
                        DIGEST,
                        "linux/amd64",
                        Instant.parse("2026-07-19T11:59:00Z"),
                        "1.0.0",
                        null,
                        "1.x",
                        "prototype",
                        List.of("autark-pro.extension"),
                        "release-test-key"),
                "sha256:" + "c".repeat(64),
                new SignedEnvelopeV1("eA", "eA", "eA"));
    }
}

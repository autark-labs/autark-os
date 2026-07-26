package com.autarkos.pro.product;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.autarkos.pro.entitlement.ProEntitlementService;
import com.autarkos.pro.entitlement.ProStatusResponse;
import com.autarkos.pro.model.ProEntitlementState;
import com.autarkos.pro.model.ProEntitlementStatus;
import com.autarkos.pro.model.ProModuleState;

class ProProductStateServiceTests {

    private static final Instant NOW =
            Instant.parse("2026-07-26T18:00:00Z");
    private static final String DIGEST = "sha256:" + "a".repeat(64);

    @Test
    void activeFixtureProducesOneRedactedCanonicalState() {
        ProProductState state = service().derive(status(
                ProEntitlementState.ACTIVE,
                true,
                true,
                true,
                ProModuleState.ACTIVE,
                "healthy",
                DIGEST), NOW);

        assertThat(state.schemaVersion()).isEqualTo("1");
        assertThat(state.overallStatus()).isEqualTo("partial");
        assertThat(state.softwareEntitlement().state()).isEqualTo("active");
        assertThat(state.hostedServices().state()).isEqualTo("active");
        assertThat(state.agent().state()).isEqualTo("active");
        assertThat(state.agent().digestPrefix())
                .isEqualTo("sha256:aaaaaaaaaaaa")
                .doesNotContain(DIGEST);
        assertThat(state.guardian().state()).isEqualTo("unavailable");
        assertThat(state.localMobile().state()).isEqualTo("unavailable");
        assertThat(state.hostedMobile().state()).isEqualTo("unavailable");
        assertThat(state.localCapabilities())
                .containsExactly("pro.example", "pro.future");
        assertThat(state.hostedCapabilities())
                .containsExactly("pro.example", "pro.future");
        assertThat(state.recommendedAction())
                .isEqualTo(new ProProductState.RecommendedAction(
                        "check_release", "release_check_available"));
    }

    @Test
    void retainedUseKeepsLocalCapabilitiesAndDropsHostedCapabilities() {
        ProProductState state = service().derive(status(
                ProEntitlementState.RETAINED_USE,
                true,
                false,
                false,
                ProModuleState.RETAINED_USE,
                "healthy",
                DIGEST), NOW);

        assertThat(state.overallStatus()).isEqualTo("retained_use");
        assertThat(state.softwareEntitlement().localUseAllowed()).isTrue();
        assertThat(state.localCapabilities()).isNotEmpty();
        assertThat(state.hostedCapabilities()).isEmpty();
    }

    @Test
    void distinctFailuresProduceDistinctStatesAndActions() {
        assertThat(derive(ProEntitlementState.REVOKED, false,
                ProModuleState.NOT_INSTALLED, "not-checked")
                .softwareEntitlement().state()).isEqualTo("revoked");
        assertThat(derive(ProEntitlementState.INVALID, false,
                ProModuleState.NOT_INSTALLED, "not-checked")
                .softwareEntitlement().state()).isEqualTo("invalid");
        assertThat(derive(ProEntitlementState.ONLINE_GRACE, true,
                ProModuleState.ACTIVE, "healthy").overallStatus())
                .isEqualTo("stale");
        assertThat(derive(ProEntitlementState.ACTIVE, true,
                ProModuleState.UPDATE_INELIGIBLE, "healthy").overallStatus())
                .isEqualTo("incompatible");
        assertThat(derive(ProEntitlementState.ACTIVE, true,
                ProModuleState.DEGRADED, "degraded").recommendedAction().id())
                .isEqualTo("check_release");
    }

    @Test
    void unknownCapabilitiesRemainOpaqueAndSorted() {
        ProProductState state = service().derive(status(
                ProEntitlementState.ACTIVE,
                true,
                true,
                false,
                ProModuleState.ACTIVE,
                "healthy",
                DIGEST), NOW);

        assertThat(state.localCapabilities())
                .containsExactly("pro.example", "pro.future");
    }

    @Test
    void presentationBoundaryDropsMalformedOrOversizedValues() {
        ProStatusResponse source = status(
                ProEntitlementState.ACTIVE,
                true,
                true,
                false,
                ProModuleState.ACTIVE,
                "healthy",
                DIGEST);
        ProEntitlementStatus unsafeEntitlement =
                new ProEntitlementStatus(
                        source.entitlement().schemaVersion(),
                        source.entitlement().state(),
                        source.entitlement().plan(),
                        List.of("pro.valid", "INVALID VALUE"),
                        source.entitlement().updatesThrough(),
                        source.entitlement().serviceLeaseExpiresAt(),
                        source.entitlement().lastVerifiedServerTime(),
                        source.entitlement().localUseAllowed(),
                        source.entitlement().updatesAllowed(),
                        source.entitlement().hostedServicesAllowed(),
                        source.entitlement().grantFingerprint(),
                        source.entitlement().reasonCode());
        ProStatusResponse.ModuleStatus unsafeModule =
                new ProStatusResponse.ModuleStatus(
                        source.module().state(),
                        "v".repeat(65),
                        source.module().activeDigest(),
                        source.module().previousDigest(),
                        source.module().previousComponentVersion(),
                        source.module().candidateVersion(),
                        source.module().health(),
                        source.module().jobId(),
                        source.module().errorCode(),
                        source.module().lastSuccessfulTransitionAt(),
                        source.module().lastTransitionAt());

        ProProductState state = service().derive(
                new ProStatusResponse(
                        source.schemaVersion(),
                        unsafeEntitlement,
                        source.device(),
                        source.activation(),
                        unsafeModule,
                        source.refresh()),
                NOW);

        assertThat(state.localCapabilities())
                .containsExactly("pro.valid");
        assertThat(state.agent().componentVersion()).isNull();
    }

    private ProProductState derive(
            ProEntitlementState entitlement,
            boolean localUse,
            ProModuleState module,
            String health) {
        return service().derive(status(
                entitlement,
                localUse,
                false,
                false,
                module,
                health,
                module == ProModuleState.NOT_INSTALLED ? null : DIGEST), NOW);
    }

    private ProProductStateService service() {
        return new ProProductStateService(
                mock(ProEntitlementService.class),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private ProStatusResponse status(
            ProEntitlementState entitlementState,
            boolean localUse,
            boolean updates,
            boolean hosted,
            ProModuleState moduleState,
            String health,
            String digest) {
        Instant updatesThrough = updates
                ? NOW.plusSeconds(31_536_000)
                : null;
        Instant servicesThrough = hosted
                ? NOW.plusSeconds(31_536_000)
                : NOW.minusSeconds(60);
        ProEntitlementStatus entitlement = new ProEntitlementStatus(
                "1",
                entitlementState,
                "opaque-plan",
                List.of("pro.future", "pro.example", "pro.future"),
                updatesThrough,
                servicesThrough,
                NOW.minusSeconds(30),
                localUse,
                updates,
                hosted,
                "redacted-fingerprint",
                entitlementState == ProEntitlementState.ACTIVE
                        ? "active"
                        : entitlementState.name().toLowerCase());
        return new ProStatusResponse(
                "1",
                entitlement,
                new ProStatusResponse.DeviceStatus("", "", "", true),
                new ProStatusResponse.ActivationStatus("idle", null, null),
                new ProStatusResponse.ModuleStatus(
                        moduleState,
                        digest == null ? null : "0.2.0",
                        digest,
                        null,
                        null,
                        null,
                        health,
                        null,
                        null,
                        NOW.minusSeconds(10),
                        NOW.minusSeconds(10)),
                new ProStatusResponse.RefreshStatus(
                        false, NOW, NOW, null, null, 0));
    }
}

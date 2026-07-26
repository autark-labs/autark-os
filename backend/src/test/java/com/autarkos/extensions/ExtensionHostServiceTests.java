package com.autarkos.extensions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import com.autarkos.pro.agent.ProAgentClientRouter;
import com.autarkos.pro.audit.ProAuditEvent;
import com.autarkos.pro.audit.ProAuditService;
import com.autarkos.pro.entitlement.ProEntitlementService;
import com.autarkos.pro.entitlement.ProStatusResponse;
import com.autarkos.pro.model.NormalizedHostSnapshot;
import com.autarkos.pro.model.ProEntitlementState;
import com.autarkos.pro.model.ProEntitlementStatus;
import com.autarkos.pro.model.ProModuleState;
import com.autarkos.pro.snapshot.NormalizedHostSnapshotAssembler;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;

class ExtensionHostServiceTests {

    private static final String DIGEST = "sha256:" + "d".repeat(64);
    private static final byte[] ENTRYPOINT =
            "export function mount(){}"
                    .getBytes(StandardCharsets.UTF_8);

    @Test
    void bindsManifestAssetAndCanonicalOpaqueStateToTheActiveDigest() {
        Fixture fixture = fixture();
        var payload = JsonNodeFactory.instance.objectNode()
                .put("private", true);
        when(fixture.state().loadCanonical("autark-pro", DIGEST))
                .thenReturn(Optional.empty());
        when(fixture.agent().renderSurface(
                        eq("storage.insights"),
                        any(NormalizedHostSnapshot.class),
                        isNull()))
                .thenReturn(new ExtensionSurfaceEnvelope(
                        "1",
                        "storage.insights",
                        1,
                        "new",
                        "opaque_next_state",
                        payload));

        assertThat(fixture.service().manifest("autark-pro")
                .entrypoint()).isEqualTo("entry.js");
        assertThat(fixture.service().asset(
                        "autark-pro", "entry.js").contents())
                .isEqualTo(ENTRYPOINT);
        assertThat(fixture.service().render(
                        "autark-pro", "storage.insights").payload())
                .isEqualTo(payload);
        verify(fixture.state()).cleanupExpired(
                eq("autark-pro"), anySet(), any(Instant.class));
        verify(fixture.state()).saveCanonical(
                "autark-pro",
                DIGEST,
                1,
                "opaque_next_state");
    }

    @Test
    void projectsEverySurfaceFromOneCanonicalStateSequence() {
        Fixture fixture = fixture();
        var payload = JsonNodeFactory.instance.objectNode()
                .put("private", true);
        when(fixture.state().loadCanonical("autark-pro", DIGEST))
                .thenReturn(
                        Optional.empty(),
                        Optional.of(new ExtensionStateStore.ExtensionState(
                                "opaque_storage_state", 1)));
        when(fixture.agent().renderSurface(
                        eq("storage.insights"),
                        any(NormalizedHostSnapshot.class),
                        isNull()))
                .thenReturn(envelope("storage.insights", "new", payload));
        when(fixture.agent().renderSurface(
                        eq("discover.insights"),
                        any(NormalizedHostSnapshot.class),
                        eq("opaque_storage_state")))
                .thenReturn(envelope(
                        "discover.insights", "compatible", payload));

        fixture.service().render("autark-pro", "storage.insights");
        fixture.service().render("autark-pro", "discover.insights");

        verify(fixture.agent()).renderSurface(
                eq("discover.insights"),
                any(NormalizedHostSnapshot.class),
                eq("opaque_storage_state"));
        verify(fixture.state(), times(2)).saveCanonical(
                "autark-pro", DIGEST, 1, "opaque_next_state");
    }

    @Test
    void resetsLegacySurfaceTokensWithAnAuditedStateNotice() {
        Fixture fixture = fixture();
        var payload = JsonNodeFactory.instance.objectNode()
                .put("private", true);
        when(fixture.state().hasLegacySurfaceState("autark-pro", DIGEST))
                .thenReturn(true);
        when(fixture.state().loadCanonical("autark-pro", DIGEST))
                .thenReturn(Optional.empty());
        when(fixture.agent().renderSurface(
                        eq("storage.insights"),
                        any(NormalizedHostSnapshot.class),
                        isNull()))
                .thenReturn(envelope("storage.insights", "new", payload));

        ExtensionSurfaceResult result = fixture.service().render(
                "autark-pro", "storage.insights");

        assertThat(result.state().compatibility()).isEqualTo("reset");
        verify(fixture.state()).resetLegacySurfaceState(
                "autark-pro", DIGEST);
        verify(fixture.audit()).recordRequired(any(ProAuditEvent.class));
    }

    @Test
    void resetsAnIncompatibleCanonicalStateBeforeCallingTheAgent() {
        Fixture fixture = fixture();
        var payload = JsonNodeFactory.instance.objectNode()
                .put("private", true);
        when(fixture.state().loadCanonical("autark-pro", DIGEST))
                .thenReturn(Optional.of(new ExtensionStateStore.ExtensionState(
                        "unsupported_state", 2)));
        when(fixture.agent().renderSurface(
                        eq("storage.insights"),
                        any(NormalizedHostSnapshot.class),
                        isNull()))
                .thenReturn(envelope("storage.insights", "new", payload));

        ExtensionSurfaceResult result = fixture.service().render(
                "autark-pro", "storage.insights");

        assertThat(result.state().compatibility()).isEqualTo("reset");
        verify(fixture.state()).clearCanonical("autark-pro", DIGEST);
        verify(fixture.audit()).recordRequired(any(ProAuditEvent.class));
    }

    @Test
    void retiresTheContinuationAfterPrivateDurableImport() {
        Fixture fixture = fixture();
        var payload = JsonNodeFactory.instance.objectNode()
                .put("private", true);
        when(fixture.state().loadCanonical("autark-pro", DIGEST))
                .thenReturn(Optional.of(
                        new ExtensionStateStore.ExtensionState(
                                "final_encrypted_continuation",
                                1)));
        when(fixture.agent().renderSurface(
                        eq("storage.insights"),
                        any(NormalizedHostSnapshot.class),
                        eq("final_encrypted_continuation")))
                .thenReturn(new ExtensionSurfaceEnvelope(
                        "1",
                        "storage.insights",
                        1,
                        "compatible",
                        null,
                        payload));

        fixture.service().render("autark-pro", "storage.insights");

        verify(fixture.state()).clearCanonical("autark-pro", DIGEST);
    }

    @Test
    void refreshReturnsOnlyValidatedGenericPresentationAndRetiresState() {
        Fixture fixture = fixture();
        when(fixture.state().loadCanonical("autark-pro", DIGEST))
                .thenReturn(Optional.of(
                        new ExtensionStateStore.ExtensionState(
                                "final_encrypted_continuation",
                                1)));
        when(fixture.agent().refresh(
                        any(NormalizedHostSnapshot.class),
                        eq("final_encrypted_continuation")))
                .thenReturn(new ExtensionRefreshResult(
                        "1",
                        Instant.now(),
                        "compatible",
                        2,
                        "high",
                        new ExtensionRefreshResult.Recommendation(
                                "pro",
                                "review-guardian",
                                "Review Guardian")));

        ExtensionRefreshResult result =
                fixture.service().refresh("autark-pro");

        assertThat(result.activeFindingCount()).isEqualTo(2);
        verify(fixture.state()).clearCanonical("autark-pro", DIGEST);
    }

    @Test
    void refreshRejectsUncontractedNavigation() {
        Fixture fixture = fixture();
        when(fixture.state().loadCanonical("autark-pro", DIGEST))
                .thenReturn(Optional.empty());
        when(fixture.agent().refresh(
                        any(NormalizedHostSnapshot.class),
                        isNull()))
                .thenReturn(new ExtensionRefreshResult(
                        "1",
                        Instant.now(),
                        "compatible",
                        1,
                        "high",
                        new ExtensionRefreshResult.Recommendation(
                                "system",
                                "execute-command",
                                "Run command")));

        assertThatThrownBy(() ->
                fixture.service().refresh("autark-pro"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    @Test
    void rejectsAbsentUnknownStaleAndDigestMismatchedExtensions() {
        Fixture fixture = fixture();
        assertNotFound(() -> fixture.service().manifest("unknown"));

        when(fixture.entitlements().status()).thenReturn(
                status(true, null, null));
        assertNotFound(() -> fixture.service().manifest("autark-pro"));

        when(fixture.entitlements().status()).thenReturn(
                status(true, DIGEST, "healthy"));
        when(fixture.agent().uiManifest()).thenReturn(
                manifest("9.9.9", sha256(ENTRYPOINT)));
        assertThatThrownBy(() ->
                fixture.service().manifest("autark-pro"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");

        when(fixture.entitlements().status()).thenReturn(
                status(false, DIGEST, "healthy"));
        assertNotFound(() -> fixture.service().manifest("autark-pro"));

        when(fixture.entitlements().status()).thenReturn(
                status(true, DIGEST, "healthy"));
        when(fixture.agent().uiManifest()).thenReturn(
                manifest("1.2.3", "sha256:" + "0".repeat(64)));
        assertThatThrownBy(() -> fixture.service().asset(
                        "autark-pro", "entry.js"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("502");
    }

    @Test
    void recordsRejectedPrivateNavigationWithoutBrowserControlledFields() {
        Fixture fixture = fixture();

        fixture.service().recordNavigationRejection("autark-pro");

        verify(fixture.audit()).recordRequired(any(ProAuditEvent.class));
    }

    private static Fixture fixture() {
        ProAgentClientRouter agent = mock(ProAgentClientRouter.class);
        ProEntitlementService entitlements =
                mock(ProEntitlementService.class);
        NormalizedHostSnapshotAssembler snapshots =
                mock(NormalizedHostSnapshotAssembler.class);
        ExtensionStateStore state = mock(ExtensionStateStore.class);
        ProAuditService audit = mock(ProAuditService.class);
        when(entitlements.status()).thenReturn(
                status(true, DIGEST, "healthy"));
        when(agent.uiManifest()).thenReturn(
                manifest("1.2.3", sha256(ENTRYPOINT)));
        when(agent.uiAsset("entry.js")).thenReturn(ENTRYPOINT);
        NormalizedHostSnapshot snapshot =
                mock(NormalizedHostSnapshot.class);
        when(snapshot.generatedAt()).thenReturn(Instant.now());
        when(snapshots.assemble()).thenReturn(snapshot);
        return new Fixture(
                new ExtensionHostService(
                        agent, entitlements, snapshots, state, audit),
                agent,
                entitlements,
                state,
                audit);
    }

    private static ProStatusResponse status(
            boolean localUseAllowed,
            String digest,
            String health) {
        ProEntitlementStatus entitlement = new ProEntitlementStatus(
                "1",
                localUseAllowed
                        ? ProEntitlementState.ACTIVE
                        : ProEntitlementState.REVOKED,
                localUseAllowed ? "pro_home" : null,
                localUseAllowed
                        ? List.of("autark-pro.extension")
                        : List.of(),
                null,
                null,
                Instant.parse("2026-07-21T12:00:00Z"),
                localUseAllowed,
                localUseAllowed,
                localUseAllowed,
                localUseAllowed ? "grant" : null,
                localUseAllowed ? "active" : "revoked");
        return new ProStatusResponse(
                "1",
                entitlement,
                null,
                null,
                module(digest, health),
                null);
    }

    private static ProStatusResponse.ModuleStatus module(
            String digest,
            String health) {
        return new ProStatusResponse.ModuleStatus(
                digest == null
                        ? ProModuleState.NOT_INSTALLED
                        : ProModuleState.ACTIVE,
                digest == null ? null : "1.2.3",
                digest,
                null,
                null,
                null,
                health == null ? "not-checked" : health,
                null,
                null,
                null,
                null);
    }

    private static ExtensionUiManifest manifest(
            String version,
            String digest) {
        return new ExtensionUiManifest(
                "1",
                "autark-pro",
                version,
                "entry.js",
                digest,
                List.of(
                        "pro.dashboard",
                        "storage.insights",
                        "discover.insights"));
    }

    private static ExtensionSurfaceEnvelope envelope(
            String surface,
            String compatibility,
            com.fasterxml.jackson.databind.JsonNode payload) {
        return new ExtensionSurfaceEnvelope(
                "1", surface, 1, compatibility,
                "opaque_next_state", payload);
    }

    private static String sha256(byte[] contents) {
        try {
            return "sha256:" + HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256")
                            .digest(contents));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static void assertNotFound(
            org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
        assertThatThrownBy(call)
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
    }

    private record Fixture(
            ExtensionHostService service,
            ProAgentClientRouter agent,
            ProEntitlementService entitlements,
            ExtensionStateStore state,
            ProAuditService audit) {
    }
}

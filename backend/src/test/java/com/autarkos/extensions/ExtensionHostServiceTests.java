package com.autarkos.extensions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
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
    void bindsManifestAssetAndOpaqueStateToTheActiveDigest() {
        Fixture fixture = fixture();
        var payload = JsonNodeFactory.instance.objectNode()
                .put("private", true);
        when(fixture.state().load(
                        "autark-pro", DIGEST, "storage.insights"))
                .thenReturn(Optional.empty());
        when(fixture.agent().renderSurface(
                        eq("storage.insights"),
                        any(NormalizedHostSnapshot.class),
                        isNull()))
                .thenReturn(new ExtensionSurfaceEnvelope(
                        "1",
                        "storage.insights",
                        "opaque_next_state",
                        payload));

        assertThat(fixture.service().manifest("autark-pro")
                .entrypoint()).isEqualTo("entry.js");
        assertThat(fixture.service().asset(
                        "autark-pro", "entry.js").contents())
                .isEqualTo(ENTRYPOINT);
        assertThat(fixture.service().render(
                        "autark-pro", "storage.insights"))
                .isEqualTo(payload);
        verify(fixture.state()).clearOtherDigests(
                "autark-pro", DIGEST);
        verify(fixture.state()).save(
                "autark-pro",
                DIGEST,
                "storage.insights",
                "opaque_next_state");
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
                .hasMessageContaining("502");

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

    private static Fixture fixture() {
        ProAgentClientRouter agent = mock(ProAgentClientRouter.class);
        ProEntitlementService entitlements =
                mock(ProEntitlementService.class);
        NormalizedHostSnapshotAssembler snapshots =
                mock(NormalizedHostSnapshotAssembler.class);
        ExtensionStateStore state = mock(ExtensionStateStore.class);
        when(entitlements.status()).thenReturn(
                status(true, DIGEST, "healthy"));
        when(agent.uiManifest()).thenReturn(
                manifest("1.2.3", sha256(ENTRYPOINT)));
        when(agent.uiAsset("entry.js")).thenReturn(ENTRYPOINT);
        when(snapshots.assemble()).thenReturn(
                mock(NormalizedHostSnapshot.class));
        return new Fixture(
                new ExtensionHostService(
                        agent, entitlements, snapshots, state),
                agent,
                entitlements,
                state);
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
                health == null ? "not-checked" : health,
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
            ExtensionStateStore state) {
    }
}

package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.apps.ApplicationEvidence;
import com.autarkos.apps.ApplicationRelationship;
import com.autarkos.apps.ApplicationState;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.apps.ApplicationView;
import com.autarkos.marketplace.install.AppRuntimeView;
import com.autarkos.system.UpdateInventoryModels.Snapshot;

class UpdateInventoryServiceTests {

    private static final Instant NOW = Instant.parse("2026-09-12T12:00:00Z");
    private static final AutarkOsIdentity IDENTITY = new AutarkOsIdentity(
            "pos_current", "current", "/var/lib/autark-os", "sha256:runtime", NOW, 1);

    @Test
    void normalUpdateRetainsSeveralManagedApps() {
        ApplicationStateService states = mock(ApplicationStateService.class);
        InstanceIdentityService identities = mock(InstanceIdentityService.class);
        List<ApplicationView> before = List.of(
                managed("vaultwarden", "appinst_vault", "/var/lib/autark-os/apps/vaultwarden", "autarkos_current_vaultwarden"),
                managed("homepage", "appinst_home", "/var/lib/autark-os/apps/homepage", "autarkos_current_homepage"));
        List<ApplicationView> after = List.of(
                managed("homepage", "appinst_home", "/var/lib/autark-os/apps/homepage", "autarkos_current_homepage"),
                managed("vaultwarden", "appinst_vault", "/var/lib/autark-os/apps/vaultwarden", "autarkos_current_vaultwarden"));
        when(states.refreshNowExclusively()).thenReturn(state(before), state(after));
        when(identities.current()).thenReturn(IDENTITY);
        UpdateInventoryService service = new UpdateInventoryService(states, identities);

        Snapshot snapshot = service.capture();
        var verification = service.verify(snapshot);

        assertThat(snapshot.managedApps()).extracting(app -> app.catalogAppId())
                .containsExactly("vaultwarden", "homepage");
        assertThat(verification.safe()).isTrue();
        assertThat(verification.outcomes()).extracting(outcome -> outcome.status())
                .containsOnly("managed");
        assertThat(verification.violations()).isEmpty();
    }

    @Test
    void missingRegistrationIsAcceptedOnlyAsExplicitRecovery() {
        var verification = verifyTransition(
                List.of(managed("vaultwarden", "appinst_vault", "/var/lib/autark-os/apps/vaultwarden", "autarkos_current_vaultwarden")),
                List.of(recoveryRequired("vaultwarden", Map.of(
                        "appInstanceId", "appinst_vault",
                        "autarkOsInstanceId", "pos_current",
                        "composeProject", "autarkos_current_vaultwarden"))),
                IDENTITY);

        assertThat(verification.safe()).isTrue();
        assertThat(verification.outcomes()).singleElement().satisfies(outcome -> {
            assertThat(outcome.currentRelationship()).isEqualTo("recovery_required");
            assertThat(outcome.status()).isEqualTo("recovery_required");
        });
    }

    @Test
    void missingOwnershipMetadataRemainsARecoverableCaseWhenRuntimeEvidenceMatches() {
        var verification = verifyTransition(
                List.of(managed("homepage", "appinst_home", "/var/lib/autark-os/apps/homepage", "autarkos_current_homepage")),
                List.of(recoveryRequired("homepage", Map.of(
                        "appInstanceId", "appinst_home",
                        "composeProject", "autarkos_current_homepage"))),
                IDENTITY);

        assertThat(verification.safe()).isTrue();
        assertThat(verification.summary()).contains("1 explicit recovery case");
    }

    @Test
    void rejectsAnUnexpectedRuntimeRootChange() {
        AutarkOsIdentity changed = new AutarkOsIdentity(
                "pos_current", "current", "/mnt/other/autark-os", "sha256:other", NOW, 1);
        var verification = verifyTransition(
                List.of(managed("vaultwarden", "appinst_vault", "/var/lib/autark-os/apps/vaultwarden", "autarkos_current_vaultwarden")),
                List.of(managed("vaultwarden", "appinst_vault", "/var/lib/autark-os/apps/vaultwarden", "autarkos_current_vaultwarden")),
                changed);

        assertThat(verification.safe()).isFalse();
        assertThat(verification.violations()).extracting(violation -> violation.code())
                .containsExactly("runtime_root_changed");
    }

    @Test
    void rejectsAReleaseThatMisclassifiesManagedDockerLabelsAsConflict() {
        var verification = verifyTransition(
                List.of(managed("vaultwarden", "appinst_vault", "/var/lib/autark-os/apps/vaultwarden", "autarkos_current_vaultwarden")),
                List.of(application("vaultwarden", ApplicationRelationship.BLOCKED, null, null)),
                IDENTITY);

        assertThat(verification.safe()).isFalse();
        assertThat(verification.violations()).extracting(violation -> violation.code())
                .containsExactly("became_blocked");
    }

    @Test
    void rejectsAnAppThatDisappearsFromTheCatalogInventory() {
        var verification = verifyTransition(
                List.of(managed("vaultwarden", "appinst_vault", "/var/lib/autark-os/apps/vaultwarden", "autarkos_current_vaultwarden")),
                List.of(),
                IDENTITY);

        assertThat(verification.safe()).isFalse();
        assertThat(verification.violations()).extracting(violation -> violation.code())
                .containsExactly("application_disappeared");
    }

    @Test
    void rejectsRecoveryEvidenceThatBelongsToAnotherAppInstance() {
        var verification = verifyTransition(
                List.of(managed("vaultwarden", "appinst_vault", "/var/lib/autark-os/apps/vaultwarden", "autarkos_current_vaultwarden")),
                List.of(recoveryRequired("vaultwarden", Map.of(
                        "appInstanceId", "appinst_other",
                        "autarkOsInstanceId", "pos_current",
                        "composeProject", "autarkos_current_vaultwarden"))),
                IDENTITY);

        assertThat(verification.safe()).isFalse();
        assertThat(verification.violations()).extracting(violation -> violation.code())
                .containsExactly("recovery_identity_mismatch");
    }

    @Test
    void captureRejectsAStaleInventoryAfterRefreshFailure() {
        ApplicationStateService states = mock(ApplicationStateService.class);
        InstanceIdentityService identities = mock(InstanceIdentityService.class);
        ApplicationState stale = new ApplicationState(
                List.of(managed("vaultwarden", "appinst_vault", "/var/lib/autark-os/apps/vaultwarden", "autarkos_current_vaultwarden")),
                NOW,
                AutarkOsStates.SnapshotState.ERROR,
                NOW,
                NOW,
                true,
                "Docker inventory unavailable",
                NOW.plusSeconds(10));
        when(states.refreshNowExclusively()).thenReturn(stale);
        when(identities.current()).thenReturn(IDENTITY);

        assertThatThrownBy(() -> new UpdateInventoryService(states, identities).capture())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("fresh managed-app inventory");
    }

    @Test
    void verificationRejectsAStalePostUpdateInventory() {
        ApplicationStateService states = mock(ApplicationStateService.class);
        InstanceIdentityService identities = mock(InstanceIdentityService.class);
        ApplicationState initialState = state(List.of(managed(
                "vaultwarden", "appinst_vault", "/var/lib/autark-os/apps/vaultwarden", "autarkos_current_vaultwarden")));
        ApplicationState staleState = new ApplicationState(
                initialState.applications(),
                NOW,
                AutarkOsStates.SnapshotState.ERROR,
                NOW,
                NOW,
                true,
                "Docker inventory unavailable",
                NOW.plusSeconds(10));
        when(states.refreshNowExclusively())
                .thenReturn(initialState)
                .thenReturn(staleState);
        when(identities.current()).thenReturn(IDENTITY);
        UpdateInventoryService service = new UpdateInventoryService(states, identities);
        Snapshot before = service.capture();

        assertThatThrownBy(() -> service.verify(before))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("fresh managed-app inventory");
    }

    private UpdateInventoryModels.Verification verifyTransition(
            List<ApplicationView> before,
            List<ApplicationView> after,
            AutarkOsIdentity afterIdentity) {
        ApplicationStateService states = mock(ApplicationStateService.class);
        InstanceIdentityService identities = mock(InstanceIdentityService.class);
        when(states.refreshNowExclusively()).thenReturn(state(before), state(after));
        when(identities.current()).thenReturn(IDENTITY, afterIdentity);
        UpdateInventoryService service = new UpdateInventoryService(states, identities);
        return service.verify(service.capture());
    }

    private ApplicationView managed(String appId, String appInstanceId, String runtimePath, String composeProject) {
        AppRuntimeView runtime = mock(AppRuntimeView.class);
        when(runtime.runtimePath()).thenReturn(runtimePath);
        when(runtime.composeProject()).thenReturn(composeProject);
        ApplicationView application = application(appId, ApplicationRelationship.MANAGED, runtime, null);
        when(application.appInstanceId()).thenReturn(appInstanceId);
        when(application.ownershipState()).thenReturn(AutarkOsStates.OwnershipState.OWNED_MANAGED);
        return application;
    }

    private ApplicationView recoveryRequired(String appId, Map<String, String> metadata) {
        ApplicationEvidence evidence = new ApplicationEvidence(
                "docker:" + appId, "docker", null, "LAN", "owned_managed", "running",
                "Registration missing", "Registration missing.", metadata.getOrDefault("appInstanceId", ""),
                metadata.getOrDefault("autarkOsInstanceId", ""), "", metadata.getOrDefault("composeProject", ""));
        return application(appId, ApplicationRelationship.RECOVERY_REQUIRED, null, evidence);
    }

    private ApplicationView application(
            String appId,
            ApplicationRelationship relationship,
            AppRuntimeView runtime,
            ApplicationEvidence evidence) {
        ApplicationView application = mock(ApplicationView.class);
        when(application.id()).thenReturn(appId);
        when(application.relationship()).thenReturn(relationship);
        when(application.managed()).thenReturn(relationship == ApplicationRelationship.MANAGED);
        when(application.runtime()).thenReturn(runtime);
        when(application.evidence()).thenReturn(evidence);
        return application;
    }

    private ApplicationState state(List<ApplicationView> applications) {
        return new ApplicationState(applications, NOW);
    }
}

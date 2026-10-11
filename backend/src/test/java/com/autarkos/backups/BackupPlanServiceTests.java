package com.autarkos.backups;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.ManagedAppAttestationService;
import com.autarkos.marketplace.install.ManagedStorageContractService;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.system.ProjectSettings;
import com.autarkos.system.ProjectSettingsService;

class BackupPlanServiceTests {
    @TempDir Path root;
    final BackupService backups = mock(BackupService.class);
    final InstalledAppRepository installed = mock(InstalledAppRepository.class);
    final ManagedAppAttestationService managed = mock(ManagedAppAttestationService.class);
    final ProjectSettingsService settings = mock(ProjectSettingsService.class);
    final RecoveryOperationCoordinator operations = new RecoveryOperationCoordinator();
    BackupPlanService plans;
    InstalledApp app;

    @BeforeEach
    void setUp() throws Exception {
        app = new InstalledApp("homepage", "Homepage", "Running", root.toString(), "homepage-project", "", Instant.now());
        Files.writeString(root.resolve("compose.yaml"), "services: {}\n");
        when(managed.managedApps()).thenReturn(List.of(app));
        when(backups.backupEligibleApps(org.mockito.ArgumentMatchers.anyBoolean())).thenReturn(List.of(app));
        when(installed.ownershipFor(app.appId())).thenReturn(Optional.of(ownership("instance-one")));
        when(installed.settingsFor(app.appId())).thenReturn(Optional.of(InstallModels.InstallSettings.defaults("")));
        when(managed.durableStorage(app, true)).thenReturn(new ManagedStorageContractService.Contract(app, Map.of("data", root.resolve("data"))));
        when(settings.current()).thenReturn(ProjectSettings.defaults("test"));
        when(backups.destination()).thenReturn(destination("disk-one"));
        when(backups.backupUnavailableReason(org.mockito.ArgumentMatchers.any())).thenReturn("");
        plans = new BackupPlanService(backups, installed, managed, settings,
                new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator()), operations);
    }

    @ParameterizedTest
    @ValueSource(strings = {"app", "full", "routine"})
    void reviewNamesExactAppsAndDisclosesInterruptionBeforeDispatch(String scope) {
        var plan = plans.plan(scope, "app".equals(scope) ? app.appId() : null);
        assertThat(plan.executable()).isTrue();
        assertThat(plan.apps()).containsExactly(new BackupModels.BackupPlanApp("homepage", "Homepage"));
        assertThat(plan.warnings()).anyMatch(message -> message.contains("unavailable"));
        assertThat(plan.warnings()).anyMatch(message -> message.contains("already paused will stay paused"));
        assertThat(plan.planId()).matches("[0-9a-f]{64}");
        assertThat(plans.plan(scope, plan.appId()).planId()).isEqualTo(plan.planId());
        verify(backups, never()).run("homepage");
    }

    @Test
    void missingReviewCannotDispatch() {
        assertThatThrownBy(() -> plans.runReviewed("app", "homepage", null))
                .isInstanceOf(InstallationException.class).hasMessageContaining("Review the affected apps");
        verify(backups, never()).run("homepage");
    }

    @ParameterizedTest
    @ValueSource(strings = {"ownership", "destination", "storage", "scope", "policy"})
    void changedReviewedScopeOrConfigurationCannotDispatch(String changed) {
        var reviewed = new BackupModels.BackupRunRequest(plans.plan("full", null).planId());
        switch (changed) {
            case "ownership" -> when(installed.ownershipFor("homepage")).thenReturn(Optional.of(ownership("replacement-instance")));
            case "destination" -> when(backups.destination()).thenReturn(destination("replacement-disk"));
            case "storage" -> when(managed.durableStorage(app, true)).thenReturn(new ManagedStorageContractService.Contract(app, Map.of("data", root.resolve("new-data"))));
            case "scope" -> when(backups.backupEligibleApps(org.mockito.ArgumentMatchers.anyBoolean())).thenReturn(List.of());
            case "policy" -> when(installed.settingsFor("homepage")).thenReturn(Optional.of(new InstallModels.InstallSettings("", null, false, Map.of(), new InstallModels.BackupPolicy(false, "daily", 7))));
        }
        assertThatThrownBy(() -> plans.runReviewed("full", null, reviewed)).isInstanceOf(InstallationException.class);
        verify(backups, never()).runFullBackup("manual");
    }

    @Test
    void reviewedExecutionAndItsFinalCheckHoldTheRecoveryOperationLease() {
        var reviewed = new BackupModels.BackupRunRequest(plans.plan("app", "homepage").planId());
        when(backups.run("homepage")).thenAnswer(invocation -> {
            assertThat(operations.activeOperation()).contains(RecoveryOperationCoordinator.Operation.APP_BACKUP);
            return new BackupModels.BackupRunResult("homepage", "Homepage", "completed", "Done", null, Instant.now());
        });
        assertThat(plans.runReviewed("app", "homepage", reviewed).status()).isEqualTo("completed");
        assertThat(operations.activeOperation()).isEmpty();
    }

    @Test
    void unavailableLiveStorageBlocksReviewWithoutExposingRawDiagnostics() {
        when(managed.durableStorage(app, true)).thenThrow(new InstallationException("private path /secret/data"));
        var plan = plans.plan("app", "homepage");
        assertThat(plan.executable()).isFalse();
        assertThat(plan.blockedReasons()).anyMatch(message -> message.contains("could not be confirmed"));
        assertThat(plan.blockedReasons()).noneMatch(message -> message.contains("/secret"));
    }

    @Test
    void optionalDestinationMetadataDoesNotPreventReview() {
        when(backups.destination()).thenReturn(new BackupModels.BackupDestination("internal", "ready", root.toString(), null, null, null,
                true, true, Long.MAX_VALUE, false, "Ready", "Open Backups", Instant.now()));
        assertThat(plans.plan("app", "homepage").executable()).isTrue();
    }

    @Test
    void routineOffBlocksItsPlanButAllowsManualAppReview() {
        var defaults = ProjectSettings.defaults("test");
        when(settings.current()).thenReturn(new ProjectSettings(defaults.deviceName(), defaults.timeZone(), defaults.language(),
                defaults.temperatureUnit(), defaults.dateFormat(), defaults.timeFormat(), defaults.startOnBoot(), defaults.telemetryEnabled(),
                defaults.defaultInstallAccess(), defaults.automaticRepairEnabled(), false, defaults.backupFrequency(), defaults.backupRetentionDays(),
                defaults.backupTime(), defaults.updatedAt()));
        assertThat(plans.plan("routine", null).blockedReasons()).anyMatch(message -> message.contains("turned off"));
        assertThat(plans.plan("app", "homepage").executable()).isTrue();
    }

    private RuntimeModels.InstalledAppOwnershipMetadata ownership(String instance) {
        return new RuntimeModels.InstalledAppOwnershipMetadata("homepage", instance, "homepage", "autark-instance", root.toString(), "installed", "owned", Instant.now(), Instant.now());
    }

    private BackupModels.BackupDestination destination(String identity) {
        return new BackupModels.BackupDestination("internal", "ready", root.resolve("backups").toString(), root.toString(), identity, "ext4", true, true,
                Long.MAX_VALUE, false, "Ready", "Open Backups", Instant.now());
    }
}

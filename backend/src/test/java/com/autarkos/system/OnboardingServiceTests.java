package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.autarkos.activity.ActivityLogRepository;
import com.autarkos.activity.ActivityLogService;
import com.autarkos.backups.BackupDestinationService;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.network.tailscale.TailscaleStatus;
import com.autarkos.security.AdminSecurityService;

class OnboardingServiceTests {

    @TempDir
    Path runtimeRoot;

    @TempDir
    Path externalRoot;

    @Test
    void onboardingReportsTheSharedCadenceWithoutReplacingItOnUnrelatedSave() {
        RuntimeLayout layout = runtimeLayout();
        var repository = JpaTestRepositories.projectSettingsRepository(layout);
        repository.saveValues(java.util.Map.of("backupFrequency", "hourly"));
        var onboarding = service(repository, layout);
        assertThat(onboarding.state().backupFrequency()).isEqualTo("hourly");
        assertThat(onboarding.update(new OnboardingModels.OnboardingUpdateRequest(
                "in_progress", 3, "renamed", null, null, null, null, null)).backupFrequency()).isEqualTo("hourly");
    }

    @Test
    void recommendationsUseBetaRosterAndFilterPreviouslySavedExcludedApps() {
        RuntimeLayout layout = runtimeLayout();
        ProjectSettingsRepository repository = JpaTestRepositories.projectSettingsRepository(layout);
        OnboardingService onboarding = service(repository, layout);
        assertThat(onboarding.state().recommendedApps()).containsExactly("freshrss", "homepage", "syncthing");
        assertThat(ProjectSettings.defaults("Autark-OS").automaticRepairEnabled()).isFalse();

        repository.saveValues(java.util.Map.of("onboardingRecommendedApps", "vaultwarden,homepage"));
        assertThat(onboarding.state().recommendedApps()).containsExactly("homepage");

        onboarding.update(new OnboardingModels.OnboardingUpdateRequest(null, null, null, null, null, null,
                List.of("immich", "freshrss"), null));
        assertThat(onboarding.state().recommendedApps()).containsExactly("freshrss");
        onboarding.update(new OnboardingModels.OnboardingUpdateRequest(null, null, null, null, null, null,
                List.of("immich"), null));
        assertThat(onboarding.state().recommendedApps()).isEmpty();
    }

    @Test
    void adminClaimSettingsDoNotSilentlyCompleteFirstBootSetup() {
        RuntimeLayout runtimeLayout = runtimeLayout();
        ProjectSettingsRepository repository = JpaTestRepositories.projectSettingsRepository(runtimeLayout);
        AdminSecurityService security = new AdminSecurityService(repository, runtimeLayout, false);
        security.status();

        OnboardingModels.OnboardingState state = service(repository, runtimeLayout).state();

        assertThat(repository.hasAnySettings()).isTrue();
        assertThat(state.status()).isEqualTo("not_started");
    }

    @Test
    void completingOnboardingAlsoCompletesTheSharedSetupProgress() {
        RuntimeLayout runtimeLayout = runtimeLayout();
        ProjectSettingsRepository repository = JpaTestRepositories.projectSettingsRepository(runtimeLayout);
        OnboardingService service = service(repository, runtimeLayout);

        service.complete();

        assertThat(service.state().status()).isEqualTo("complete");
        assertThat(new SetupProgressService(repository, service).status().setupComplete()).isTrue();
    }

    @Test
    void preparesAndReturnsExternalBackupDestination() throws Exception {
        OnboardingService service = service();
        Path destination = externalRoot.resolve("autark-os-backups");

        OnboardingModels.OnboardingState state = service.update(new OnboardingModels.OnboardingUpdateRequest("in_progress", 3, null, destination.toString(), true, null, null, null));

        assertThat(state.backupDestination()).isEqualTo(destination.toAbsolutePath().normalize().toString());
        assertThat(Files.isDirectory(destination)).isTrue();
        assertThat(state.automaticBackupsEnabled()).isTrue();
    }

    @Test
    void rejectsBackupDestinationWhenParentDoesNotExist() {
        OnboardingService service = service();
        Path destination = externalRoot.resolve("missing-parent/autark-os-backups");

        assertThatThrownBy(() -> service.update(new OnboardingModels.OnboardingUpdateRequest("in_progress", 3, null, destination.toString(), true, null, null, null)))
                .isInstanceOf(InstallationException.class)
                .hasMessageContaining("parent folder");
    }

    @ParameterizedTest
    @ValueSource(strings = {"/", "/./", "/../backups"})
    void equivalentInternalPathsCannotBeSavedAsExternalBackupPosture(String suffix) {
        var layout = runtimeLayout();
        var repository = JpaTestRepositories.projectSettingsRepository(layout);
        var service = service(repository, layout);
        service.state();
        var before = repository.readAll();
        String destination = layout.runtimeRoot().resolve("backups") + suffix;

        assertThatThrownBy(() -> service.update(new OnboardingModels.OnboardingUpdateRequest(
                "in_progress", 3, null, destination, false, null, null, null, "external", null)))
                .hasMessageContaining("external backup location");

        assertThat(repository.readAll()).isEqualTo(before);
    }

    @Test
    void storesPrivateAccessChoiceForFirstBootSetup() {
        OnboardingService service = service();

        OnboardingModels.OnboardingState state = service.update(new OnboardingModels.OnboardingUpdateRequest("in_progress", 2, null, null, null, "local-only", null, null));

        assertThat(state.privateAccessChoice()).isEqualTo("local-only");
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void everyCompletionEntryRechecksHardReadinessAndCannotAcknowledgeItAway(boolean viaUpdate) {
        var layout = runtimeLayout();
        var repository = JpaTestRepositories.projectSettingsRepository(layout);
        var doctor = mock(SystemDoctorService.class);
        when(doctor.status()).thenReturn(readiness(true, false));
        var service = transactional(service(repository, layout, doctor, new FakeTailscaleService()), layout);
        assertThat(service.state().doctor().readiness().canCompleteOnboarding()).isTrue();
        var before = repository.readAll();

        when(doctor.status()).thenReturn(readiness(false, false));

        assertThatThrownBy(() -> finish(service, viaUpdate, true)).hasMessageContaining("Runtime storage");
        assertThat(repository.readAll()).isEqualTo(before);
        assertThat(service.state().status()).isNotEqualTo("complete");
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void everyCompletionEntryRequiresExplicitAcknowledgementForCurrentOptionalWork(boolean viaUpdate) {
        var layout = runtimeLayout();
        var repository = JpaTestRepositories.projectSettingsRepository(layout);
        var doctor = mock(SystemDoctorService.class);
        when(doctor.status()).thenReturn(readiness(true, false));
        var service = transactional(service(repository, layout, doctor, new FakeTailscaleService()), layout);
        service.state();
        var before = repository.readAll();
        when(doctor.status()).thenReturn(readiness(true, true));

        assertThatThrownBy(() -> finish(service, viaUpdate, false)).hasMessageContaining("acknowledge");
        assertThat(repository.readAll()).isEqualTo(before);
        assertThat(finish(service, viaUpdate, true).status()).isEqualTo("complete");
        assertThat(new SetupProgressService(repository, service).status().setupComplete()).isTrue();
    }

    @Test
    void completionIsIdempotentAndAnOldDraftCannotReopenOrOverwriteIt() {
        var layout = runtimeLayout();
        var repository = JpaTestRepositories.projectSettingsRepository(layout);
        var doctor = mock(SystemDoctorService.class);
        when(doctor.status()).thenReturn(readiness(true, false));
        var service = service(repository, layout, doctor, new FakeTailscaleService());
        service.complete();
        var completed = repository.readAll();
        when(doctor.status()).thenReturn(readiness(false, false));

        assertThat(service.complete().status()).isEqualTo("complete");
        assertThat(service.update(new OnboardingModels.OnboardingUpdateRequest(
                "in_progress", 0, "stale draft name", null, true, "setup-now", List.of(), List.of(), "routine", false))
                .status()).isEqualTo("complete");
        assertThat(repository.readAll()).isEqualTo(completed);
    }

    @Test
    void privateAccessCompletionUsesObservedConnectionInsteadOfSavedChoiceOrClientSteps() {
        var layout = runtimeLayout();
        var repository = JpaTestRepositories.projectSettingsRepository(layout);
        var tailscale = mock(TailscaleService.class);
        when(tailscale.status()).thenReturn(TailscaleStatus.notConnected("Sign in needed"));
        var doctor = mock(SystemDoctorService.class);
        when(doctor.status()).thenReturn(readiness(true, false));
        var service = service(repository, layout, doctor, tailscale);
        repository.saveValues(Map.of("onboardingCompletedSteps", "device,tailscale", "privateAccessChoice", "already-connected"));
        assertThat(service.state().completedSteps()).doesNotContain("tailscale");
        service.update(new OnboardingModels.OnboardingUpdateRequest(
                "in_progress", 2, null, null, null, "already-connected", null, List.of("device", "tailscale")));

        assertThat(service.complete().completedSteps()).doesNotContain("tailscale");
        assertThat(new SetupProgressService(repository, service).status().completedSteps()).doesNotContain("tailscale_connect");
        assertThat(service.state().tailscaleConnected()).isFalse();
    }

    @Test
    void observedConnectionCompletesPrivateAccessEvenWhenTheSavedChoiceWasLocalOnly() {
        var layout = runtimeLayout();
        var repository = JpaTestRepositories.projectSettingsRepository(layout);
        repository.saveValues(Map.of("privateAccessChoice", "local-only"));
        var tailscale = mock(TailscaleService.class);
        when(tailscale.status()).thenReturn(new TailscaleStatus(true, true, "Running", "Connected", "server",
                "server.example.ts.net", List.of("100.64.0.1"), "example", "owner"));
        var doctor = mock(SystemDoctorService.class);
        when(doctor.status()).thenReturn(readiness(true, false));
        var service = service(repository, layout, doctor, tailscale);

        assertThat(service.complete().completedSteps()).contains("tailscale");
        assertThat(new SetupProgressService(repository, service).status().completedSteps()).contains("tailscale_connect");
    }

    @Test
    void backupPostureAndSchedulingRemainSeparateAndEmptyStarterSelectionSurvivesReload() {
        var layout = runtimeLayout();
        var repository = JpaTestRepositories.projectSettingsRepository(layout);
        var service = service(repository, layout);
        var external = externalRoot.resolve("manual-archives").toString();
        service.update(new OnboardingModels.OnboardingUpdateRequest(
                "in_progress", 3, null, external, false, "local-only", List.of(), null, "external", null));
        var reloaded = service(repository, layout).state();
        assertThat(reloaded.backupPosture()).isEqualTo("external");
        assertThat(reloaded.backupDestination()).isEqualTo(external);
        assertThat(reloaded.automaticBackupsEnabled()).isFalse();
        assertThat(reloaded.recommendedApps()).isEmpty();
        assertThat(reloaded.starterApps()).isEqualTo(BetaScope.CURRENT.apps().stream().filter(BetaScope.App::starter).toList());

        service.update(new OnboardingModels.OnboardingUpdateRequest(
                null, null, null, null, false, null, null, null, "routine", null));
        reloaded = service(repository, layout).state();
        assertThat(reloaded.backupPosture()).isEqualTo("routine");
        assertThat(reloaded.backupDestination()).isEqualTo(layout.runtimeRoot().resolve("backups").toString());
        assertThat(reloaded.automaticBackupsEnabled()).isFalse();
        assertThat(reloaded.recommendedApps()).isEmpty();

        repository.saveValues(Map.of("backupDestination", externalRoot.resolve("unavailable-drive/archives").toString()));
        service.update(new OnboardingModels.OnboardingUpdateRequest(
                null, null, null, null, true, null, null, null, "later", null));
        reloaded = service(repository, layout).state();
        assertThat(reloaded.backupPosture()).isEqualTo("later");
        assertThat(reloaded.backupDestination()).isEqualTo(layout.runtimeRoot().resolve("backups").toString());
        assertThat(reloaded.automaticBackupsEnabled()).isFalse();
        assertThat(reloaded.recommendedApps()).isEmpty();
    }

    @Test
    void legacyDestinationOnlyRequestReplacesExternalPostureWithSameDeviceManual() {
        var layout = runtimeLayout();
        var repository = JpaTestRepositories.projectSettingsRepository(layout);
        var service = service(repository, layout);
        service.update(new OnboardingModels.OnboardingUpdateRequest(
                "in_progress", 3, null, externalRoot.resolve("archives").toString(), false,
                null, null, null, "external", null));

        service.update(new OnboardingModels.OnboardingUpdateRequest(
                null, null, null, layout.runtimeRoot().resolve("backups") + "/./", false, null, null, null));

        var reloaded = service(repository, layout).state();
        assertThat(reloaded.backupPosture()).isEqualTo("routine");
        assertThat(reloaded.backupDestination()).isEqualTo(layout.runtimeRoot().resolve("backups").toString());
        assertThat(reloaded.automaticBackupsEnabled()).isFalse();
    }

    @Test
    void legacyDestinationOnlyRequestReplacesLaterPostureWithExternalManual() {
        var layout = runtimeLayout();
        var repository = JpaTestRepositories.projectSettingsRepository(layout);
        var service = service(repository, layout);
        service.update(new OnboardingModels.OnboardingUpdateRequest(
                "in_progress", 3, null, null, false, null, null, null, "later", null));
        String destination = externalRoot.resolve("archives").toString();

        service.update(new OnboardingModels.OnboardingUpdateRequest(
                null, null, null, destination, false, null, null, null));

        var reloaded = service(repository, layout).state();
        assertThat(reloaded.backupPosture()).isEqualTo("external");
        assertThat(reloaded.backupDestination()).isEqualTo(destination);
        assertThat(reloaded.automaticBackupsEnabled()).isFalse();
    }

    @Test
    void legacySameDestinationResubmissionPreservesExplicitLaterPosture() {
        var layout = runtimeLayout();
        var repository = JpaTestRepositories.projectSettingsRepository(layout);
        var service = service(repository, layout);
        service.update(new OnboardingModels.OnboardingUpdateRequest(
                "in_progress", 3, null, null, false, null, null, null, "later", null));

        service.update(new OnboardingModels.OnboardingUpdateRequest(
                null, 4, null, layout.runtimeRoot().resolve("backups") + "/./", null, null, null, null));

        var reloaded = service(repository, layout).state();
        assertThat(reloaded.backupPosture()).isEqualTo("later");
        assertThat(reloaded.backupDestination()).isEqualTo(layout.runtimeRoot().resolve("backups").toString());
        assertThat(reloaded.automaticBackupsEnabled()).isFalse();
    }

    @Test
    void transactionRollsBackDestinationMetadataWhenTheLaterSharedSettingsSaveFails() {
        var layout = runtimeLayout();
        var repository = JpaTestRepositories.projectSettingsRepository(layout);
        repository.saveValues(Map.of("backupDestination", externalRoot.resolve("old-archives").toString(),
                "backupDestinationIdentity", "previous-drive", "onboardingStatus", "in_progress"));
        var before = repository.readAll();
        var settings = mock(ProjectSettingsService.class);
        when(settings.current()).thenReturn(ProjectSettings.defaults("Original server"));
        when(settings.update(any(ProjectSettings.class))).thenAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isTrue();
            // Flush the real configure() writes before the later failure, proving rollback of SQL, not a mock.
            repository.flush();
            assertThat(repository.readAll().get("backupDestination")).isEqualTo(layout.runtimeRoot().resolve("backups").toString());
            assertThat(repository.readAll()).isNotEqualTo(before);
            throw new InstallationException("Shared settings failed");
        });
        var target = new OnboardingService(repository, settings, layout, new FakeTailscaleService(),
                new FakeSystemDoctorService(), new BackupDestinationService(layout, repository));
        var service = transactional(target, layout);

        assertThatThrownBy(() -> service.update(new OnboardingModels.OnboardingUpdateRequest(
                "in_progress", 4, "New server", null, false, null, List.of(), null, "routine", null)))
                .hasMessageContaining("Shared settings failed");

        assertThat(repository.readAll()).isEqualTo(before);
    }

    @Test
    void transactionRollsBackDestinationPreferencesAndProgressWhenFinalReadinessRejectsCompletion() {
        var layout = runtimeLayout();
        var repository = JpaTestRepositories.projectSettingsRepository(layout);
        var settings = new ProjectSettingsService(repository, new ActivityLogService(mock(ActivityLogRepository.class)));
        settings.current();
        repository.saveValues(Map.of("backupDestination", externalRoot.resolve("old-archives").toString(),
                "onboardingRecommendedApps", "homepage", "onboardingCurrentStep", "3"));
        var before = repository.readAll();
        var doctor = mock(SystemDoctorService.class);
        when(doctor.status()).thenAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isTrue();
            repository.flush();
            var during = repository.readAll();
            assertThat(during.get("backupDestination")).isEqualTo(layout.runtimeRoot().resolve("backups").toString());
            assertThat(during.get("deviceName")).isEqualTo("Changed server");
            assertThat(during.get("onboardingRecommendedApps")).isEmpty();
            return readiness(false, false);
        });
        var service = transactional(new OnboardingService(repository, settings, layout, new FakeTailscaleService(),
                doctor, new BackupDestinationService(layout, repository)), layout);

        assertThatThrownBy(() -> service.update(new OnboardingModels.OnboardingUpdateRequest(
                "complete", 6, "Changed server", null, true, "setup-now", List.of(), List.of("device"), "routine", true)))
                .hasMessageContaining("Runtime storage");

        assertThat(repository.readAll()).isEqualTo(before);
    }

    private static OnboardingModels.OnboardingState finish(OnboardingService service, boolean viaUpdate, boolean acknowledge) {
        return viaUpdate ? service.update(new OnboardingModels.OnboardingUpdateRequest(
                " Complete ", 6, null, null, null, null, null, null, null, acknowledge)) : service.complete(acknowledge);
    }

    private static OnboardingService transactional(OnboardingService target, RuntimeLayout layout) {
        var proxy = new ProxyFactory(target);
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(new TransactionInterceptor(JpaTestRepositories.transactionManager(layout), new AnnotationTransactionAttributeSource()));
        return (OnboardingService) proxy.getProxy();
    }

    static SystemSetupModels.SystemDoctorStatus readiness(boolean canComplete, boolean needsAcknowledgement) {
        String summary = canComplete ? "Optional setup remains." : "Runtime storage is unavailable.";
        return new SystemSetupModels.SystemDoctorStatus(canComplete ? "ready" : "blocked", "Setup readiness", summary,
                new SystemSetupModels.SystemReadinessStatus(canComplete ? "ready" : "blocked", "Setup readiness", summary,
                        canComplete, needsAcknowledgement, List.of()),
                List.of(), List.of(), "Linux", "apt", true, "http://localhost:8082", Instant.now());
    }

    static OnboardingService service(ProjectSettingsRepository repository, RuntimeLayout layout,
            SystemDoctorService doctor, TailscaleService tailscale) {
        return new OnboardingService(repository,
                new ProjectSettingsService(repository, new ActivityLogService(mock(ActivityLogRepository.class))), layout, tailscale, doctor);
    }

    private OnboardingService service() {
        RuntimeLayout runtimeLayout = runtimeLayout();
        ProjectSettingsRepository repository = JpaTestRepositories.projectSettingsRepository(runtimeLayout);
        return service(repository, runtimeLayout);
    }

    private OnboardingService service(ProjectSettingsRepository repository, RuntimeLayout runtimeLayout) {
        return readyService(repository, runtimeLayout);
    }

    static OnboardingService readyService(ProjectSettingsRepository repository, RuntimeLayout runtimeLayout) {
        ProjectSettingsService settingsService = new ProjectSettingsService(repository,
                new ActivityLogService(mock(ActivityLogRepository.class)));
        return new OnboardingService(repository, settingsService, runtimeLayout, new FakeTailscaleService(), new FakeSystemDoctorService());
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private static class FakeTailscaleService extends TailscaleService {
        @Override
        public TailscaleStatus status() {
            return TailscaleStatus.notConnected("Tailscale is waiting for sign in.");
        }
    }

    private static class FakeSystemDoctorService extends SystemDoctorService {
        private FakeSystemDoctorService() {
            super(null, null, null);
        }

        @Override
        public SystemSetupModels.SystemDoctorStatus status() {
            return new SystemSetupModels.SystemDoctorStatus(
                    "ready",
                    "This device is ready",
                    "Autark-OS can manage apps, backups, and private access.",
                    new SystemSetupModels.SystemReadinessStatus("ready", "Ready", "Autark-OS is ready.", true, false, List.of()),
                    List.of(),
                    List.of(),
                    "Linux",
                    "apt",
                    true,
                    "http://localhost:8082",
                    Instant.now());
        }
    }
}

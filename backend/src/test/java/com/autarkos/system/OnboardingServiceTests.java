package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;


import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.activity.ActivityLogRepository;
import com.autarkos.activity.ActivityLogService;
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
        assertThat(new SetupProgressService(repository).status().setupComplete()).isTrue();
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

    @Test
    void storesPrivateAccessChoiceForFirstBootSetup() {
        OnboardingService service = service();

        OnboardingModels.OnboardingState state = service.update(new OnboardingModels.OnboardingUpdateRequest("in_progress", 2, null, null, null, "local-only", null, null));

        assertThat(state.privateAccessChoice()).isEqualTo("local-only");
    }

    private OnboardingService service() {
        RuntimeLayout runtimeLayout = runtimeLayout();
        ProjectSettingsRepository repository = JpaTestRepositories.projectSettingsRepository(runtimeLayout);
        return service(repository, runtimeLayout);
    }

    private OnboardingService service(ProjectSettingsRepository repository, RuntimeLayout runtimeLayout) {
        ProjectSettingsService settingsService = new ProjectSettingsService(repository, new ActivityLogService(mock(ActivityLogRepository.class)));
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

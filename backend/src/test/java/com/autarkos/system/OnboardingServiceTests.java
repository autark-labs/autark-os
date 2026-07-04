package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.autarkos.system.api.OnboardingUpdateRequest;
import com.autarkos.system.api.OnboardingState;
import com.autarkos.system.api.SystemDoctorStatus;
import com.autarkos.system.api.SystemReadinessStatus;

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
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.network.tailscale.TailscaleStatus;

class OnboardingServiceTests {

    @TempDir
    Path runtimeRoot;

    @TempDir
    Path externalRoot;

    @Test
    void preparesAndReturnsExternalBackupDestination() throws Exception {
        OnboardingService service = service();
        Path destination = externalRoot.resolve("autark-os-backups");

        OnboardingState state = service.update(new OnboardingUpdateRequest("in_progress", 3, null, destination.toString(), true, null, null, null));

        assertThat(state.backupDestination()).isEqualTo(destination.toAbsolutePath().normalize().toString());
        assertThat(Files.isDirectory(destination)).isTrue();
        assertThat(state.automaticBackupsEnabled()).isTrue();
    }

    @Test
    void rejectsBackupDestinationWhenParentDoesNotExist() {
        OnboardingService service = service();
        Path destination = externalRoot.resolve("missing-parent/autark-os-backups");

        assertThatThrownBy(() -> service.update(new OnboardingUpdateRequest("in_progress", 3, null, destination.toString(), true, null, null, null)))
                .isInstanceOf(InstallationException.class)
                .hasMessageContaining("parent folder");
    }

    @Test
    void storesPrivateAccessChoiceForFirstBootSetup() {
        OnboardingService service = service();

        OnboardingState state = service.update(new OnboardingUpdateRequest("in_progress", 2, null, null, null, "local-only", null, null));

        assertThat(state.privateAccessChoice()).isEqualTo("local-only");
    }

    private OnboardingService service() {
        RuntimeLayout runtimeLayout = runtimeLayout();
        ProjectSettingsRepository repository = new ProjectSettingsRepository(runtimeLayout);
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
        public SystemDoctorStatus status() {
            return new SystemDoctorStatus(
                    "ready",
                    "This device is ready",
                    "Autark-OS can manage apps, backups, and private access.",
                    new SystemReadinessStatus("ready", "Ready", "Autark-OS is ready.", true, false, List.of()),
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

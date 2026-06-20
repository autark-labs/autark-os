package com.projectos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.projectos.system.api.OnboardingUpdateRequest;
import com.projectos.system.api.OnboardingState;
import com.projectos.system.api.SystemDoctorStatus;
import com.projectos.system.api.SystemReadinessStatus;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.activity.ActivityLogRepository;
import com.projectos.activity.ActivityLogService;
import com.projectos.marketplace.install.InstallationException;
import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;
import com.projectos.network.tailscale.TailscaleService;
import com.projectos.network.tailscale.TailscaleStatus;

class OnboardingServiceTests {

    @TempDir
    Path runtimeRoot;

    @TempDir
    Path externalRoot;

    @Test
    void preparesAndReturnsExternalBackupDestination() throws Exception {
        OnboardingService service = service();
        Path destination = externalRoot.resolve("project-os-backups");

        OnboardingState state = service.update(new OnboardingUpdateRequest("in_progress", 3, null, destination.toString(), true, null, null, null));

        assertThat(state.backupDestination()).isEqualTo(destination.toAbsolutePath().normalize().toString());
        assertThat(Files.isDirectory(destination)).isTrue();
        assertThat(state.automaticBackupsEnabled()).isTrue();
    }

    @Test
    void rejectsBackupDestinationWhenParentDoesNotExist() {
        OnboardingService service = service();
        Path destination = externalRoot.resolve("missing-parent/project-os-backups");

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
        ProjectSettingsService settingsService = new ProjectSettingsService(repository, new ActivityLogService(new ActivityLogRepository(runtimeLayout)));
        return new OnboardingService(repository, settingsService, runtimeLayout, new FakeTailscaleService(), new FakeSystemDoctorService());
    }

    private RuntimeLayout runtimeLayout() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
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
                    "Project OS can manage apps, backups, and private access.",
                    new SystemReadinessStatus("ready", "Ready", "Project OS is ready.", true, false, List.of()),
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

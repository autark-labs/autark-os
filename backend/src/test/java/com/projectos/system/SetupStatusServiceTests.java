package com.projectos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.host.ObservedService;
import com.projectos.host.ObservedServiceSource;
import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

class SetupStatusServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void recommendsExistingAppsWhenFoundResourcesExistAndSetupIsIncomplete() {
        SetupStatusService service = new SetupStatusService(progressService(), () -> List.of(observedService("legacy_project_os", "observed")));

        SetupStatus status = service.status();

        assertThat(status.setupComplete()).isFalse();
        assertThat(status.currentStep()).isEqualTo("existing_apps");
        assertThat(status.message()).contains("existing apps");
    }

    @Test
    void mapsProgressStepsToLeanSetupSteps() {
        SetupProgressService progress = progressService();
        progress.completeStep("welcome");
        progress.completeStep("host_check");
        progress.completeStep("docker_check");
        progress.completeStep("access_choice");

        SetupStatusService service = new SetupStatusService(progress, List::of);

        assertThat(service.status().currentStep()).isEqualTo("tailscale");
    }

    @Test
    void doneProgressReturnsDone() {
        SetupProgressService progress = progressService();
        progress.completeStep("done");

        SetupStatusService service = new SetupStatusService(progress, () -> List.of(observedService("legacy_project_os", "observed")));

        assertThat(service.status().setupComplete()).isTrue();
        assertThat(service.status().currentStep()).isEqualTo("done");
    }

    private SetupProgressService progressService() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new SetupProgressService(
                new ProjectSettingsRepository(new RuntimeLayout(properties)),
                () -> Instant.parse("2026-06-20T12:00:00Z"));
    }

    private ObservedService observedService(String ownershipState, String userVisibility) {
        return new ObservedService(
                "docker:legacy",
                ObservedServiceSource.DOCKER,
                "project-os-legacy",
                "legacy_project_os",
                "http://localhost:8080",
                "Apps",
                "local",
                "homepage",
                "label",
                ownershipState,
                userVisibility,
                "running",
                true,
                "",
                Instant.parse("2026-06-20T12:00:00Z"),
                Instant.parse("2026-06-20T12:00:00Z"),
                null,
                null,
                "{}");
    }
}

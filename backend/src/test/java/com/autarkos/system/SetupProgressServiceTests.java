package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;

class SetupProgressServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void freshRuntimeStartsIncompleteAtWelcome() {
        SetupProgressService service = service();

        SetupProgressModels.SetupProgress progress = service.status();

        assertThat(progress.setupVersion()).isEqualTo(1);
        assertThat(progress.completedSteps()).isEmpty();
        assertThat(progress.skippedSteps()).isEmpty();
        assertThat(progress.lastRecommendedStep()).isEqualTo("welcome");
        assertThat(progress.setupComplete()).isFalse();
    }

    @Test
    void completedStepPersistsAcrossServiceInstances() {
        ProjectSettingsRepository repository = repository();
        SetupProgressService first = service(repository);

        first.completeStep("welcome");

        SetupProgressService second = service(repository);
        assertThat(second.status().completedSteps()).containsExactly("welcome");
        assertThat(second.status().lastRecommendedStep()).isEqualTo("host_check");
    }

    @Test
    void skippingTailscaleAdvancesWithoutCompletingSetup() {
        SetupProgressService service = service();
        service.completeStep("welcome");
        service.completeStep("host_check");
        service.completeStep("docker_check");
        service.completeStep("access_choice");

        SetupProgressModels.SetupProgress progress = service.skipStep("tailscale_connect");

        assertThat(progress.skippedSteps()).contains("tailscale_connect");
        assertThat(progress.lastRecommendedStep()).isEqualTo("starter_apps");
        assertThat(progress.setupComplete()).isFalse();
    }

    @Test
    void completingDoneMarksSetupComplete() {
        SetupProgressService service = service();

        SetupProgressModels.SetupProgress progress = service.completeStep("done");

        assertThat(progress.completedSteps()).contains("done");
        assertThat(progress.lastRecommendedStep()).isEqualTo("done");
        assertThat(progress.setupComplete()).isTrue();
    }

    @Test
    void completingDoneMakesOnboardingUseTheSameCompletionState() {
        ProjectSettingsRepository repository = repository();
        SetupProgressService service = service(repository);

        service.completeStep("done");

        assertThat(repository.readAll().get("onboardingStatus")).isEqualTo("complete");
        assertThat(service.status().setupComplete()).isTrue();
    }

    private SetupProgressService service() {
        return service(repository());
    }

    private SetupProgressService service(ProjectSettingsRepository repository) {
        return new SetupProgressService(repository, () -> Instant.parse("2026-06-20T12:00:00Z"));
    }

    private ProjectSettingsRepository repository() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return JpaTestRepositories.projectSettingsRepository(new RuntimeLayout(properties));
    }
}

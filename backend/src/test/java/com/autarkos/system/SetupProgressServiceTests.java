package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.network.tailscale.TailscaleStatus;

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

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void doneCannotBypassHardBlockersOrOptionalWorkAcknowledgement(boolean optionalOnly) {
        var repository = repository();
        var doctor = mock(SystemDoctorService.class);
        when(doctor.status()).thenReturn(OnboardingServiceTests.readiness(optionalOnly, optionalOnly));
        var tailscale = mock(TailscaleService.class);
        when(tailscale.status()).thenReturn(TailscaleStatus.notConnected("Sign in needed"));
        var onboarding = OnboardingServiceTests.service(repository, runtimeLayout(), doctor, tailscale);
        var progress = new SetupProgressService(repository, onboarding);
        progress.completeStep("welcome");
        var before = repository.readAll();

        assertThatThrownBy(() -> progress.completeStep("done"))
                .hasMessageContaining(optionalOnly ? "acknowledge" : "Runtime storage");

        assertThat(repository.readAll()).isEqualTo(before);
        assertThat(progress.status().setupComplete()).isFalse();
        assertThat(progress.status().completedSteps()).containsExactly("welcome");
    }

    @Test
    void progressChangesAndSkippingDoneCannotReopenCompletedOnboarding() {
        var repository = repository();
        var progress = service(repository);
        progress.completeStep("done");
        progress.skipStep("welcome");
        progress.completeStep("starter_apps");
        var before = repository.readAll();

        assertThatThrownBy(() -> progress.skipStep("done")).hasMessageContaining("cannot be skipped or reopened");

        assertThat(repository.readAll()).isEqualTo(before);
        assertThat(repository.readAll().get("onboardingStatus")).isEqualTo("complete");
        assertThat(progress.status().setupComplete()).isTrue();
        assertThat(progress.status().completedSteps()).contains("done");
    }

    @Test
    void privateAccessStepRequiresObservedConnectionBeforeRecordingSuccess() {
        var repository = repository();
        var doctor = mock(SystemDoctorService.class);
        when(doctor.status()).thenReturn(OnboardingServiceTests.readiness(true, false));
        var tailscale = mock(TailscaleService.class);
        when(tailscale.status()).thenReturn(TailscaleStatus.notConnected("Sign in needed"));
        var onboarding = OnboardingServiceTests.service(repository, runtimeLayout(), doctor, tailscale);
        var progress = new SetupProgressService(repository, onboarding);
        var before = repository.readAll();

        assertThatThrownBy(() -> progress.completeStep("tailscale_connect")).hasMessageContaining("Connect this server");
        assertThat(repository.readAll()).isEqualTo(before);
        when(tailscale.status()).thenReturn(new TailscaleStatus(true, true, "Running", "Connected", "server",
                "server.example.ts.net", List.of("100.64.0.1"), "example", "owner"));

        assertThat(progress.completeStep("tailscale_connect").completedSteps()).contains("tailscale_connect");
        assertThat(progress.status().setupComplete()).isFalse();
    }

    private SetupProgressService service() {
        return service(repository());
    }

    private SetupProgressService service(ProjectSettingsRepository repository) {
        return new SetupProgressService(repository, OnboardingServiceTests.readyService(repository, runtimeLayout()), () -> Instant.parse("2026-06-20T12:00:00Z"));
    }

    private ProjectSettingsRepository repository() {
        return JpaTestRepositories.projectSettingsRepository(runtimeLayout());
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}

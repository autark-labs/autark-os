package com.autarkos.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;

class AutarkOsJobRepositoryTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void persistsJobAndStepTransitionsAcrossRepositoryInstances() {
        AutarkOsJobRepository first = repository();
        AutarkOsJob created = first.create("install_app", "vaultwarden", List.of(
                AutarkOsJobStep.pending("validate_host", "Checking this device"),
                AutarkOsJobStep.pending("start_app", "Starting app")));

        first.markRunning(created.jobId(), "validate_host");
        first.completeStep(created.jobId(), "validate_host", "This device is ready.");
        first.fail(created.jobId(), "install_failed", "Docker could not start the app.", java.util.Map.of("exitCode", "1"));

        AutarkOsJobRepository second = repository();
        AutarkOsJob loaded = second.findById(created.jobId()).orElseThrow();

        assertThat(loaded.type()).isEqualTo("install_app");
        assertThat(loaded.subjectId()).isEqualTo("vaultwarden");
        assertThat(loaded.status()).isEqualTo("failed");
        assertThat(loaded.currentStep()).isEqualTo("validate_host");
        assertThat(loaded.error()).isNotNull();
        assertThat(loaded.error().code()).isEqualTo("install_failed");
        assertThat(loaded.error().advancedDetails()).containsEntry("exitCode", "1");
        assertThat(loaded.steps()).extracting(AutarkOsJobStep::status).containsExactly("succeeded", "pending");
    }

    @Test
    void findsActiveJobForSameTypeAndSubject() {
        AutarkOsJobRepository repository = repository();
        repository.create("install_app", "vaultwarden", List.of(AutarkOsJobStep.pending("validate_host", "Checking this device")));
        repository.create("install_app", "jellyfin", List.of(AutarkOsJobStep.pending("validate_host", "Checking this device")));

        assertThat(repository.activeFor("install_app", "vaultwarden")).isPresent();
        assertThat(repository.activeFor("install_app", "missing")).isEmpty();
    }

    private AutarkOsJobRepository repository() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new AutarkOsJobRepository(new RuntimeLayout(properties), () -> Instant.parse("2026-06-20T12:00:00Z"));
    }
}

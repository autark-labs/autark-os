package com.autarkos.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;
import com.fasterxml.jackson.databind.ObjectMapper;

class AutarkOsJobRepositoryTests {

    @TempDir
    Path runtimeRoot;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void recordsAndQueriesActiveJobsByTypeAndSubject() {
        AutarkOsJobRepository repository = repository();

        repository.save(new AutarkOsJobEntity(
                "job_1",
                "install_app",
                "vaultwarden",
                "queued",
                "validate_host",
                AutarkOsJobs.stepsJson(
                        java.util.List.of(AutarkOsJobStep.pending("validate_host", "Checking this device")),
                        objectMapper),
                "2026-06-20T12:00:00Z",
                "2026-06-20T12:00:00Z"));
        repository.save(new AutarkOsJobEntity(
                "job_2",
                "install_app",
                "jellyfin",
                "succeeded",
                "finish",
                "[]",
                "2026-06-20T12:01:00Z",
                "2026-06-20T12:01:00Z"));

        assertThat(repository.activeFor("install_app", "vaultwarden")).isPresent();
        assertThat(repository.activeFor("install_app", "jellyfin")).isEmpty();
        assertThat(repository.activeJobs()).extracting(AutarkOsJobEntity::jobId).containsExactly("job_1");
        assertThat(repository.recent(10)).extracting(AutarkOsJobEntity::jobId).containsExactly("job_2", "job_1");
    }

    private AutarkOsJobRepository repository() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return JpaTestRepositories.jobRepository(new RuntimeLayout(properties));
    }
}

package com.projectos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

class StorageSampleRepositoryTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void recordsQueriesAndDeletesSamplesByAppAndTime() {
        StorageSampleRepository repository = new StorageSampleRepository(runtimeLayout());
        Instant old = Instant.parse("2026-06-19T00:00:00Z");
        Instant current = Instant.parse("2026-06-19T01:00:00Z");

        repository.record("vaultwarden", 100, old);
        repository.record("vaultwarden", 200, current);
        repository.record("gitea", 999, current);
        repository.deleteBefore(current);

        assertThat(repository.forAppSince("vaultwarden", old))
                .extracting(StorageTrendPoint::usedBytes)
                .containsExactly(200L);
        assertThat(repository.forAppSince("gitea", old))
                .extracting(StorageTrendPoint::usedBytes)
                .containsExactly(999L);
    }

    private RuntimeLayout runtimeLayout() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}

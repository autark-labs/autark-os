package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;

class ProjectSettingsRepositoryTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void savesSettingsValuesAndResolvesBackupDestination() {
        ProjectSettingsRepository repository = JpaTestRepositories.projectSettingsRepository(runtimeLayout());

        repository.save(new ProjectSettings(
                "autark-os-test",
                "America/Chicago",
                "en-US",
                "fahrenheit",
                "MMM d, yyyy",
                "12-hour",
                true,
                false,
                "local",
                true,
                true,
                "daily",
                14,
                "03:00",
                "stable",
                true,
                Instant.parse("2026-06-19T12:00:00Z")));
        repository.saveValues(Map.of("backupDestination", runtimeRoot.resolve("external-backups").toString()));

        assertThat(repository.hasAnySettings()).isTrue();
        assertThat(repository.readAll())
                .containsEntry("deviceName", "autark-os-test")
                .containsEntry("backupRetentionDays", "14")
                .containsEntry("backupDestination", runtimeRoot.resolve("external-backups").toString());
        assertThat(repository.backupDestination(runtimeRoot.resolve("backups"))).isEqualTo(runtimeRoot.resolve("external-backups").toAbsolutePath().normalize());
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}

package com.autarkos.database;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;

class RepositoryJpaArchitectureTests {

    @Test
    void firstRepositorySliceUsesOneJpaRepositoryPerEntityWithoutFacades() throws Exception {
        List<Path> repositories = List.of(
                Path.of("src/main/java/com/autarkos/activity/ActivityLogRepository.java"),
                Path.of("src/main/java/com/autarkos/system/StorageSampleRepository.java"),
                Path.of("src/main/java/com/autarkos/monitoring/HostMetricSampleRepository.java"),
                Path.of("src/main/java/com/autarkos/monitoring/AppMetricSampleRepository.java"));

        for (Path repository : repositories) {
            String source = Files.readString(repository);

            assertThat(source)
                    .as(repository + " should be the canonical Spring Data repository")
                    .doesNotContain("extends DatabaseBackedRepository")
                    .doesNotContain("java.sql.")
                    .contains("interface ")
                    .contains("extends JpaRepository");
        }

        List<Path> removedFacades = List.of(
                Path.of("src/main/java/com/autarkos/monitoring/MonitoringMetricsRepository.java"),
                Path.of("src/main/java/com/autarkos/activity/ActivityLogJpaRepository.java"),
                Path.of("src/main/java/com/autarkos/system/StorageSampleJpaRepository.java"),
                Path.of("src/main/java/com/autarkos/monitoring/HostMetricSampleJpaRepository.java"),
                Path.of("src/main/java/com/autarkos/monitoring/AppMetricSampleJpaRepository.java"));

        for (Path removedFacade : removedFacades) {
            assertThat(Files.exists(removedFacade))
                    .as(removedFacade + " should not exist after canonical repository migration")
                    .isFalse();
        }
    }
}

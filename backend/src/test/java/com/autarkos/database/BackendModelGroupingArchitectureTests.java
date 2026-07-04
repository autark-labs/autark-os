package com.autarkos.database;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;

class BackendModelGroupingArchitectureTests {

    @Test
    void featureDtoModelsAreGroupedInsteadOfOneRecordPerFile() {
        List<Path> groupedModels = List.of(
                Path.of("src/main/java/com/autarkos/discover/DiscoverInstallModels.java"),
                Path.of("src/main/java/com/autarkos/discover/DiscoverSetupModels.java"),
                Path.of("src/main/java/com/autarkos/backups/BackupModels.java"),
                Path.of("src/main/java/com/autarkos/backups/RestoreModels.java"),
                Path.of("src/main/java/com/autarkos/host/HostModels.java"),
                Path.of("src/main/java/com/autarkos/system/OnboardingModels.java"),
                Path.of("src/main/java/com/autarkos/system/SetupProgressModels.java"),
                Path.of("src/main/java/com/autarkos/system/SupportModels.java"),
                Path.of("src/main/java/com/autarkos/system/SystemSetupModels.java"),
                Path.of("src/main/java/com/autarkos/system/SystemSummaryModels.java"),
                Path.of("src/main/java/com/autarkos/system/StorageModels.java"));

        for (Path groupedModel : groupedModels) {
            assertThat(Files.exists(groupedModel))
                    .as(groupedModel + " should contain related API/model records")
                    .isTrue();
        }

        List<Path> oldStandaloneModels = List.of(
                Path.of("src/main/java/com/autarkos/discover/DiscoverInstallPreview.java"),
                Path.of("src/main/java/com/autarkos/discover/DiscoverSetupSchema.java"),
                Path.of("src/main/java/com/autarkos/backups/BackupReport.java"),
                Path.of("src/main/java/com/autarkos/backups/RestorePlan.java"),
                Path.of("src/main/java/com/autarkos/host/ObservedServiceAdoptionPlan.java"),
                Path.of("src/main/java/com/autarkos/host/ObservedServiceMatchRequest.java"),
                Path.of("src/main/java/com/autarkos/system/api/OnboardingState.java"),
                Path.of("src/main/java/com/autarkos/system/api/SupportBundle.java"),
                Path.of("src/main/java/com/autarkos/system/api/SystemSetupStatus.java"),
                Path.of("src/main/java/com/autarkos/system/StorageReport.java"),
                Path.of("src/main/java/com/autarkos/system/SystemSummary.java"));

        for (Path oldStandaloneModel : oldStandaloneModels) {
            assertThat(Files.exists(oldStandaloneModel))
                    .as(oldStandaloneModel + " should not return as a standalone DTO file")
                    .isFalse();
        }
    }
}

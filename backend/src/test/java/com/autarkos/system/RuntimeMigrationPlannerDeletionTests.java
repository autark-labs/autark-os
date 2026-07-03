package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Arrays;

import org.junit.jupiter.api.Test;

class RuntimeMigrationPlannerDeletionTests {

    @Test
    void runtimeMigrationApiTypesAreDeletedUntilAnApplyJobExists() {
        assertMissing("com.autarkos.system.api.RuntimeMigrationPlan");
        assertMissing("com.autarkos.system.api.RuntimeMigrationPlanRequest");
        assertMissing("com.autarkos.system.RuntimeMigrationGuidance");
    }

    @Test
    void storageServiceAndReportDoNotExposeMigrationPlanning() {
        assertThat(Arrays.stream(StorageService.class.getDeclaredMethods()).map(method -> method.getName()))
                .doesNotContain("migrationPlan");
        assertThat(Arrays.stream(StorageReport.class.getRecordComponents()).map(component -> component.getName()))
                .doesNotContain("migrationGuidance");
    }

    private void assertMissing(String className) {
        assertThatThrownBy(() -> Class.forName(className))
                .isInstanceOf(ClassNotFoundException.class);
    }
}

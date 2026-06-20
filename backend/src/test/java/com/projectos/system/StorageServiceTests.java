package com.projectos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.activity.ActivityLogRepository;
import com.projectos.activity.ActivityLogService;
import com.projectos.marketplace.install.InstalledAppRepository;
import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;
import com.projectos.system.api.RuntimeMigrationPlan;

class StorageServiceTests {

    @TempDir
    Path tempDir;

    @Test
    void plansExecutableRuntimeMigrationForSeparateAbsoluteTarget() throws Exception {
        RuntimeLayout layout = runtimeLayout(tempDir.resolve("runtime"));
        Files.createDirectories(layout.runtimeRoot().resolve("apps"));
        StorageService service = storageService(layout);

        RuntimeMigrationPlan plan = service.migrationPlan(tempDir.resolve("external/project-os-data").toString());

        assertThat(plan.status()).isEqualTo("ready");
        assertThat(plan.executable()).isTrue();
        assertThat(plan.sourcePath()).isEqualTo(layout.runtimeRoot().toAbsolutePath().normalize().toString());
        assertThat(plan.targetPath()).endsWith("external/project-os-data");
        assertThat(plan.steps()).extracting(RuntimeMigrationPlan.Step::id)
                .containsExactly("backup", "stop-service", "sync-data", "validate-copy", "update-env", "fix-permissions", "restart-service", "verify");
        assertThat(plan.rollbackGuidance()).isNotEmpty();
    }

    @Test
    void rejectsUnsafeRuntimeMigrationTargets() throws Exception {
        RuntimeLayout layout = runtimeLayout(tempDir.resolve("runtime"));
        Files.createDirectories(layout.runtimeRoot());
        StorageService service = storageService(layout);

        RuntimeMigrationPlan relative = service.migrationPlan("relative/path");
        RuntimeMigrationPlan current = service.migrationPlan(layout.runtimeRoot().toString());
        RuntimeMigrationPlan child = service.migrationPlan(layout.runtimeRoot().resolve("child").toString());

        assertThat(relative.executable()).isFalse();
        assertThat(relative.blockedReasons()).anyMatch(reason -> reason.contains("absolute"));
        assertThat(current.executable()).isFalse();
        assertThat(current.blockedReasons()).anyMatch(reason -> reason.contains("current runtime"));
        assertThat(child.executable()).isFalse();
        assertThat(child.blockedReasons()).anyMatch(reason -> reason.contains("inside the current runtime"));
    }

    private StorageService storageService(RuntimeLayout layout) {
        return new StorageService(
                layout,
                new InstalledAppRepository(layout),
                new ActivityLogService(new ActivityLogRepository(layout)),
                new StorageSampleRepository(layout),
                new RuntimeFileOperations());
    }

    private RuntimeLayout runtimeLayout(Path runtimeRoot) {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}

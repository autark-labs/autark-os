package com.autarkos.backups;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.marketplace.install.AppActionResult;
import com.autarkos.marketplace.install.AppHealthSnapshot;
import com.autarkos.marketplace.install.AppLifecycleService;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.ManagedAppAttestationService;
import com.autarkos.marketplace.install.ManagedStorageContractService;

class RestoreExecutorTests {
    @Test
    void fullRestoreKeepsEarlierSuccessAndNamesFailedAndUnattemptedApps() throws Exception {
        var repository = mock(BackupRepository.class);
        var lifecycle = mock(AppLifecycleService.class);
        var archives = mock(BackupArchiveService.class);
        var verification = mock(BackupVerificationService.class);
        var planner = mock(RestorePlanner.class);
        var managed = mock(ManagedAppAttestationService.class);
        var first = app("first", "First app");
        var second = app("second", "Second app");
        var third = app("third", "Third app");
        var row = RestorePoints.create("__full__", "All apps", "full", "manual", "first,second,third",
                "/backups/full.zip", "completed", 10, "Backup", "a".repeat(64), "cold_file", 1);
        ReflectionTestUtils.setField(row, "id", 42L);
        var point = RestorePoints.toDomain(row);
        when(repository.findById(42L)).thenReturn(Optional.of(row));
        var plan = mock(RestoreModels.RestorePlan.class);
        when(plan.executable()).thenReturn(true);
        when(plan.scope()).thenReturn("full");
        when(planner.requireReviewed(42L, null, "review")).thenReturn(plan);
        when(planner.affectedApps(point, null)).thenReturn(List.of(first, second, third));
        when(managed.durableStorage(first, true)).thenReturn(new ManagedStorageContractService.Contract(first, Map.of()));
        when(managed.durableStorage(second, true)).thenThrow(new IllegalStateException("Second app storage became unavailable."));
        when(lifecycle.prepareCheckpoint(first.appId())).thenReturn(new AppLifecycleService.CheckpointState(first, "instance", true, "job"));
        when(archives.createCheckpoint(first, Map.of(), "pre_restore")).thenReturn(point);
        when(verification.restoreIntegrity(any())).thenReturn(BackupVerificationService.IntegrityCheck.ready());
        when(lifecycle.start(first.appId())).thenReturn(new AppActionResult(first.appId(), "start", "ready", "Started", null, List.of(), Instant.now()));
        when(lifecycle.healthSnapshot(first.appId())).thenReturn(new AppHealthSnapshot(first.appId(), "ready", "Healthy", "", "running", "", "", false, Instant.now()));

        var executor = new RestoreExecutor(repository, mock(InstalledAppRepository.class), mock(ActivityLogService.class),
                lifecycle, archives, verification, planner, managed, mock(BackupJobs.class));
        var result = executor.restore(42L, null, "review");

        assertThat(result.status()).isEqualTo("failed");
        assertThat(result.restoredAppIds()).containsExactly("first");
        assertThat(result.failedAppIds()).containsExactly("second");
        assertThat(result.unattemptedAppIds()).containsExactly("third");
        assertThat(result.message()).contains("Restored: First app", "Failed: Second app", "Not attempted: Third app", "Earlier successful restores were kept");
        verify(archives).restoreAppData(Path.of(point.path()), "full", first.appId());
        verify(managed, never()).durableStorage(third, true);
        verify(lifecycle, never()).prepareCheckpoint(second.appId());
    }

    private InstalledApp app(String id, String name) {
        return new InstalledApp(id, name, "Ready", "/apps/" + id, id, "", Instant.now());
    }
}

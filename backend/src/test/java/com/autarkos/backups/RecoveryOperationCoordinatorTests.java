package com.autarkos.backups;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.fileops.AutarkOsFileOpsService;
import com.autarkos.marketplace.api.MarketplaceExceptionHandler;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.AppLifecycleService;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.ProjectSettingsRepository;
import com.autarkos.system.ProjectSettingsService;
import com.autarkos.system.RuntimeFileOperations;
import com.autarkos.system.StorageSampleRepository;
import com.autarkos.system.StorageService;

class RecoveryOperationCoordinatorTests {

    @Test
    void rejectsASecondRecoveryOperationUntilTheFirstOneFinishes() throws Exception {
        RecoveryOperationCoordinator coordinator = new RecoveryOperationCoordinator();
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<String> backup = executor.submit(() -> coordinator.runExclusive(
                    RecoveryOperationCoordinator.Operation.APP_BACKUP,
                    () -> {
                        started.countDown();
                        await(release);
                        return "completed";
                    }));

            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
            assertThat(coordinator.activeOperation()).contains(RecoveryOperationCoordinator.Operation.APP_BACKUP);
            assertThatThrownBy(() -> coordinator.runExclusive(
                    RecoveryOperationCoordinator.Operation.RESTORE,
                    () -> "should not run"))
                    .isInstanceOf(RecoveryOperationConflictException.class)
                    .hasMessage("Autark-OS is already creating an app backup. Wait for it to finish before starting a restore.");

            release.countDown();
            assertThat(backup.get(2, TimeUnit.SECONDS)).isEqualTo("completed");
            assertThat(coordinator.activeOperation()).isEmpty();
            assertThat(coordinator.runExclusive(
                    RecoveryOperationCoordinator.Operation.RESTORE,
                    () -> "restored")).isEqualTo("restored");
        } finally {
            release.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void scheduledWorkSkipsInsteadOfWaitingWhenRecoveryOperationIsBusy() {
        RecoveryOperationCoordinator coordinator = new RecoveryOperationCoordinator();
        AtomicBoolean scheduledActionRan = new AtomicBoolean(false);

        coordinator.runExclusive(RecoveryOperationCoordinator.Operation.RESTORE, () -> {
            Optional<String> result = coordinator.tryRunExclusive(
                    RecoveryOperationCoordinator.Operation.ROUTINE_BACKUP,
                    () -> {
                        scheduledActionRan.set(true);
                        return "backup";
                    });

            assertThat(result).isEmpty();
            return null;
        });

        assertThat(scheduledActionRan).isFalse();
    }

    @Test
    void releasesTheGuardWhenAnOperationFails() {
        RecoveryOperationCoordinator coordinator = new RecoveryOperationCoordinator();

        assertThatThrownBy(() -> coordinator.runExclusive(
                RecoveryOperationCoordinator.Operation.RESTORE_VERIFICATION,
                () -> {
                    throw new IllegalStateException("Archive could not be read.");
                }))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Archive could not be read.");

        assertThat(coordinator.activeOperation()).isEmpty();
        assertThat(coordinator.runExclusive(
                RecoveryOperationCoordinator.Operation.APP_BACKUP,
                () -> "completed")).isEqualTo("completed");
    }

    @Test
    void backupServiceAndStorageCleanupShareTheSameBackendGuard() throws Exception {
        RecoveryOperationCoordinator coordinator = new RecoveryOperationCoordinator();
        BackupService backupService = backupService(coordinator);
        StorageService storageService = storageService(coordinator);
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<?> activeRestore = executor.submit(() -> coordinator.runExclusive(
                    RecoveryOperationCoordinator.Operation.RESTORE,
                    () -> {
                        started.countDown();
                        await(release);
                        return null;
                    }));
            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();

            assertRecoveryConflict(() -> backupService.configureDestination("/mnt/backups"));
            assertRecoveryConflict(() -> backupService.run("vaultwarden"));
            assertRecoveryConflict(backupService::runAutomatic);
            assertRecoveryConflict(() -> backupService.runFullBackup("manual"));
            assertRecoveryConflict(() -> backupService.restorePlan(42L, "vaultwarden"));
            assertRecoveryConflict(() -> backupService.verify(42L));
            assertRecoveryConflict(() -> backupService.restore(42L, "vaultwarden"));
            assertRecoveryConflict(() -> storageService.cleanupOrphan("old-app"));
            assertThat(backupService.runAutomaticIfDue()).isEmpty();
            assertThat(backupService.pruneRoutineRetention()).isZero();

            release.countDown();
            activeRestore.get(2, TimeUnit.SECONDS);
        } finally {
            release.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void conflictIsReturnedAsAnActionableHttpConflict() {
        RecoveryOperationConflictException conflict = new RecoveryOperationConflictException(
                RecoveryOperationCoordinator.Operation.RESTORE,
                RecoveryOperationCoordinator.Operation.STORAGE_CLEANUP);
        ActivityLogService activityLogService = mock(ActivityLogService.class);
        MarketplaceExceptionHandler handler = new MarketplaceExceptionHandler(activityLogService);

        var response = handler.recoveryOperationConflict(conflict);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().code()).isEqualTo("recovery_operation_conflict");
        assertThat(response.getBody().message()).contains("already restoring app data");
        assertThat(response.getBody().details()).containsExactly("Wait for the current operation to finish, then try again.");
        verify(activityLogService).warning(
                "backup",
                "recovery_operation_conflict",
                "Recovery operation is already running",
                conflict.getMessage(),
                null);
    }

    private BackupService backupService(RecoveryOperationCoordinator coordinator) {
        return new BackupService(
                mock(RuntimeLayout.class),
                mock(InstalledAppRepository.class),
                mock(BackupRepository.class),
                mock(ActivityLogService.class),
                mock(ProjectSettingsRepository.class),
                mock(ProjectSettingsService.class),
                mock(AppLifecycleService.class),
                mock(MarketplaceCatalogService.class),
                List::of,
                mock(RuntimeFileOperations.class),
                mock(AutarkOsFileOpsService.class),
                mock(BackupDestinationService.class),
                coordinator);
    }

    private StorageService storageService(RecoveryOperationCoordinator coordinator) {
        InstalledAppRepository installedApps = mock(InstalledAppRepository.class);
        StorageSampleRepository samples = mock(StorageSampleRepository.class);
        return new StorageService(
                mock(RuntimeLayout.class),
                installedApps,
                mock(ActivityLogService.class),
                samples,
                List::of,
                mock(RuntimeFileOperations.class),
                mock(BackupDestinationService.class),
                coordinator);
    }

    private void assertRecoveryConflict(Runnable action) {
        assertThatThrownBy(action::run).isInstanceOf(RecoveryOperationConflictException.class);
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(2, TimeUnit.SECONDS)) {
                throw new AssertionError("Timed out waiting for the test operation to be released.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AssertionError("Interrupted while waiting for the test operation.", exception);
        }
    }
}

package com.autarkos.backups;

import java.util.Optional;
import java.util.function.Supplier;

import org.springframework.stereotype.Service;

/**
 * Owns the single backend-wide slot for operations that read or replace live
 * app data or mutate recovery archives.
 *
 * Autark-OS runs one backend process per appliance. Jobs, scheduled work, and
 * direct API mutations all share this singleton, so frontend state cannot be
 * used as a safety boundary.
 */
@Service
public class RecoveryOperationCoordinator {

    private ActiveOperation activeOperation;
    private long nextLeaseId;

    public <T> T runExclusive(Operation operation, Supplier<T> action) {
        try (Lease ignored = acquire(operation)) {
            return action.get();
        }
    }

    public <T> Optional<T> tryRunExclusive(Operation operation, Supplier<T> action) {
        Optional<Lease> lease = tryAcquire(operation);
        if (lease.isEmpty()) {
            return Optional.empty();
        }
        try (Lease ignored = lease.get()) {
            return Optional.ofNullable(action.get());
        }
    }

    public synchronized Optional<Operation> activeOperation() {
        return Optional.ofNullable(activeOperation).map(ActiveOperation::operation);
    }

    private synchronized Lease acquire(Operation operation) {
        if (activeOperation != null) {
            throw new RecoveryOperationConflictException(activeOperation.operation(), operation);
        }
        return reserve(operation);
    }

    private synchronized Optional<Lease> tryAcquire(Operation operation) {
        if (activeOperation != null) {
            return Optional.empty();
        }
        return Optional.of(reserve(operation));
    }

    private Lease reserve(Operation operation) {
        long leaseId = ++nextLeaseId;
        activeOperation = new ActiveOperation(leaseId, operation);
        return new Lease(this, leaseId);
    }

    private synchronized void release(long leaseId) {
        if (activeOperation != null && activeOperation.leaseId() == leaseId) {
            activeOperation = null;
        }
    }

    public enum Operation {
        APP_BACKUP("an app backup", "creating an app backup"),
        FULL_BACKUP("a full backup", "creating a full backup"),
        ROUTINE_BACKUP("a routine backup", "creating a routine backup"),
        RESTORE_PLAN("restore review", "preparing a restore plan"),
        RESTORE_VERIFICATION("restore-point verification", "verifying a restore point"),
        RESTORE("a restore", "restoring app data"),
        BACKUP_RETENTION("backup cleanup", "cleaning up older restore points"),
        STORAGE_CLEANUP("storage cleanup", "cleaning up unused app data"),
        BACKUP_DESTINATION_CHANGE("a backup destination change", "changing the backup destination"),
        UNINSTALL_CHECKPOINT("an app uninstall", "creating an uninstall safety checkpoint"),
        APP_UPDATE("an app update", "updating an app safely"),
        APP_ROLLBACK("an app rollback", "rolling an app back safely");

        private final String actionLabel;
        private final String inProgressLabel;

        Operation(String actionLabel, String inProgressLabel) {
            this.actionLabel = actionLabel;
            this.inProgressLabel = inProgressLabel;
        }

        public String actionLabel() {
            return actionLabel;
        }

        public String inProgressLabel() {
            return inProgressLabel;
        }
    }

    private record ActiveOperation(long leaseId, Operation operation) {
    }

    private static final class Lease implements AutoCloseable {

        private final RecoveryOperationCoordinator coordinator;
        private final long leaseId;
        private boolean closed;

        private Lease(RecoveryOperationCoordinator coordinator, long leaseId) {
            this.coordinator = coordinator;
            this.leaseId = leaseId;
        }

        @Override
        public void close() {
            if (!closed) {
                closed = true;
                coordinator.release(leaseId);
            }
        }
    }
}

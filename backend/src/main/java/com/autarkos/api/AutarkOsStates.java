package com.autarkos.api;

public final class AutarkOsStates {

    private AutarkOsStates() {
    }

    public static final class AppStatus {
        public static final String READY = "Ready";
        public static final String STARTING = "Starting";
        public static final String PAUSED = "Paused";
        public static final String STOPPED = "Stopped";
        public static final String INSTALLED = "Installed";
        public static final String NEEDS_ATTENTION = "Needs attention";
        public static final String UNAVAILABLE = "Unavailable";
        public static final String MISSING = "Missing";

        private AppStatus() {
        }
    }

    public static final class ManagementState {
        public static final String MANAGED = "managed";
        public static final String LINKED = "linked";
        public static final String FOUND = "found";

        private ManagementState() {
        }
    }

    public static final class OwnershipState {
        public static final String OWNED_MANAGED = "owned_managed";
        public static final String LEGACY_AUTARK_OS = "legacy_autark_os";
        public static final String FOREIGN_AUTARK_OS = "foreign_autark_os";
        public static final String FAILED_INSTALL = "failed_install";
        public static final String UNKNOWN_CONFLICT = "unknown_conflict";

        private OwnershipState() {
        }
    }

    public static final class ReadinessState {
        public static final String READY = "ready";
        public static final String STARTING = "starting";
        public static final String PAUSED = "paused";
        public static final String STOPPED = "stopped";
        public static final String UNREACHABLE = "unreachable";
        public static final String UNKNOWN = "unknown";

        private ReadinessState() {
        }
    }

    public static final class AttentionState {
        public static final String NONE = "none";
        public static final String NEEDS_REVIEW = "needs_review";
        public static final String CONFLICT = "conflict";
        public static final String BLOCKED = "blocked";

        private AttentionState() {
        }
    }

    public static final class OperationKind {
        public static final String IDLE = "idle";
        public static final String STARTING = "starting";
        public static final String STOPPING = "stopping";
        public static final String RESTARTING = "restarting";
        public static final String REPAIRING = "repairing";
        public static final String BACKING_UP = "backing_up";
        public static final String RESTORING = "restoring";
        public static final String UNINSTALLING = "uninstalling";
        public static final String FAILED = "failed";

        private OperationKind() {
        }
    }

    public static final class SnapshotState {
        public static final String STALE = "stale";
        public static final String IDLE = "idle";
        public static final String RUNNING = "running";
        public static final String ERROR = "error";

        private SnapshotState() {
        }
    }

    public static final class JobType {
        public static final String INSTALL_APP = "install_app";
        public static final String START_APP = "start_app";
        public static final String STOP_APP = "stop_app";
        public static final String RESTART_APP = "restart_app";
        public static final String REPAIR_APP = "repair_app";
        public static final String BACKUP = "backup";
        public static final String BACKUP_VERIFY = "backup_verify";
        public static final String BACKUP_RESTORE = "backup_restore";
        public static final String UNINSTALL_APP = "uninstall_app";

        private JobType() {
        }
    }

    public static final class JobStatus {
        public static final String QUEUED = "queued";
        public static final String RUNNING = "running";
        public static final String SUCCEEDED = "succeeded";
        public static final String FAILED = "failed";
        public static final String CANCELLED = "cancelled";
        public static final String CANCELED = "canceled";
        public static final String PENDING = "pending";
        public static final String COMPLETED = "completed";

        private JobStatus() {
        }
    }

    public static final class BackupState {
        public static final String DISABLED = "backup_disabled";
        public static final String PROTECTED_BY_RESTORE_POINT = "protected_by_restore_point";
        public static final String ENABLED_NO_RESTORE_POINT = "backup_enabled_no_restore_point";

        private BackupState() {
        }
    }

    public static final class RestorePointStatus {
        public static final String COMPLETED = "completed";
        public static final String FAILED = "failed";
        public static final String WARNING = "warning";
        public static final String VERIFIED = "verified";

        private RestorePointStatus() {
        }
    }

    public static final class RestoreSimulationStatus {
        public static final String PASSED = "passed";
        public static final String WARNING = "warning";
        public static final String FAILED = "failed";

        private RestoreSimulationStatus() {
        }
    }

    public static final class Tone {
        public static final String SUCCESS = "success";
        public static final String WARNING = "warning";
        public static final String DANGER = "danger";
        public static final String ERROR = "error";
        public static final String INFO = "info";

        private Tone() {
        }
    }
}

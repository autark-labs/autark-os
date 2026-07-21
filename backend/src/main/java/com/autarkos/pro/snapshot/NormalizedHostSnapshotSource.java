package com.autarkos.pro.snapshot;

import java.util.List;

import com.autarkos.access.AccessStatus;
import com.autarkos.activity.ActivityLog;
import com.autarkos.apps.ApplicationState;
import com.autarkos.backups.BackupModels;
import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.monitoring.MonitoringHistory;
import com.autarkos.system.ProjectVersionInfo;
import com.autarkos.system.ProjectSettings;
import com.autarkos.system.StorageModels;
import com.autarkos.system.SystemMetrics;
import com.autarkos.system.SystemSetupModels;

interface NormalizedHostSnapshotSource {

    ProjectVersionInfo version();

    default ProjectSettings settings() {
        return null;
    }

    default String agentVersion() {
        return "not-installed";
    }

    SystemSetupModels.SystemSetupStatus setup();

    ApplicationState applications();

    AccessStatus access();

    BackupModels.BackupReport backups();

    StorageModels.StorageReport storage();

    SystemMetrics metrics();

    MonitoringHistory monitoring();

    List<AutarkOsJob> jobs();

    List<ActivityLog> activity();
}

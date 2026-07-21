package com.autarkos.pro.snapshot;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.autarkos.access.AccessStatus;
import com.autarkos.access.AccessStatusService;
import com.autarkos.activity.ActivityLog;
import com.autarkos.activity.ActivityLogService;
import com.autarkos.apps.ApplicationState;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.backups.BackupModels;
import com.autarkos.backups.BackupService;
import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.monitoring.MonitoringHistory;
import com.autarkos.monitoring.MonitoringMetricsService;
import com.autarkos.pro.module.ProModuleRepository;
import com.autarkos.system.ProjectSettings;
import com.autarkos.system.ProjectSettingsService;
import com.autarkos.system.ProjectVersionInfo;
import com.autarkos.system.ProjectVersionService;
import com.autarkos.system.StorageModels;
import com.autarkos.system.StorageService;
import com.autarkos.system.SystemMetrics;
import com.autarkos.system.SystemMetricsService;
import com.autarkos.system.SystemSetupModels;
import com.autarkos.system.SystemSetupService;

@Component
final class CeNormalizedHostSnapshotSource
        implements NormalizedHostSnapshotSource {

    private final ProjectVersionService versions;
    private final ProjectSettingsService settings;
    private final ProModuleRepository modules;
    private final SystemSetupService setup;
    private final ApplicationStateService applications;
    private final AccessStatusService access;
    private final BackupService backups;
    private final StorageService storage;
    private final SystemMetricsService metrics;
    private final MonitoringMetricsService monitoring;
    private final AutarkOsJobService jobs;
    private final ActivityLogService activity;

    @Autowired
    CeNormalizedHostSnapshotSource(
            ProjectVersionService versions,
            ProjectSettingsService settings,
            ProModuleRepository modules,
            SystemSetupService setup,
            ApplicationStateService applications,
            AccessStatusService access,
            BackupService backups,
            StorageService storage,
            SystemMetricsService metrics,
            MonitoringMetricsService monitoring,
            AutarkOsJobService jobs,
            ActivityLogService activity) {
        this.versions = versions;
        this.settings = settings;
        this.modules = modules;
        this.setup = setup;
        this.applications = applications;
        this.access = access;
        this.backups = backups;
        this.storage = storage;
        this.metrics = metrics;
        this.monitoring = monitoring;
        this.jobs = jobs;
        this.activity = activity;
    }

    CeNormalizedHostSnapshotSource(
            ProjectVersionService versions,
            SystemSetupService setup,
            ApplicationStateService applications,
            AccessStatusService access,
            BackupService backups,
            StorageService storage,
            SystemMetricsService metrics,
            MonitoringMetricsService monitoring,
            AutarkOsJobService jobs,
            ActivityLogService activity) {
        this(
                versions,
                null,
                null,
                setup,
                applications,
                access,
                backups,
                storage,
                metrics,
                monitoring,
                jobs,
                activity);
    }

    @Override
    public ProjectVersionInfo version() {
        return versions.info();
    }

    @Override
    public ProjectSettings settings() {
        return settings == null ? null : settings.current();
    }

    @Override
    public String agentVersion() {
        if (modules == null) {
            return "not-installed";
        }
        String version = modules.load().componentVersion();
        return version == null || version.isBlank()
                ? "not-installed"
                : version;
    }

    @Override
    public SystemSetupModels.SystemSetupStatus setup() {
        return setup.status();
    }

    @Override
    public ApplicationState applications() {
        return applications.snapshot();
    }

    @Override
    public AccessStatus access() {
        return access.status();
    }

    @Override
    public BackupModels.BackupReport backups() {
        return backups.report();
    }

    @Override
    public StorageModels.StorageReport storage() {
        return storage.report();
    }

    @Override
    public SystemMetrics metrics() {
        return metrics.metrics();
    }

    @Override
    public MonitoringHistory monitoring() {
        return monitoring.history(360);
    }

    @Override
    public List<AutarkOsJob> jobs() {
        return jobs.list();
    }

    @Override
    public List<ActivityLog> activity() {
        return activity.recent(200);
    }
}

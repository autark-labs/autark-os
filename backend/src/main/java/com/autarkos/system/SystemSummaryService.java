package com.autarkos.system;

import java.time.Instant;
import java.util.List;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.apps.ApplicationView;
import com.autarkos.apps.ApplicationViews;
import com.autarkos.backups.BackupDestinationService;
import com.autarkos.backups.BackupModels;
import com.autarkos.api.AutarkOsAction;
import com.autarkos.api.AutarkOsIssue;
import com.autarkos.api.AutarkOsIssueFactory;

@Service
public class SystemSummaryService implements SystemSummaryProvider {

    private final Supplier<List<ApplicationView>> appViews;
    private final Supplier<ProjectSettings> settings;
    private final Supplier<AutarkOsIdentity> identity;
    private final Supplier<SystemSetupModels.SystemSetupStatus> setupStatus;
    private final Supplier<SetupProgressModels.SetupProgress> setupProgress;
    private final Supplier<String> lanUrl;
    private final Supplier<Instant> clock;
    private final Supplier<BackupModels.BackupDestination> backupDestination;

    @Autowired
    public SystemSummaryService(
            ApplicationStateService applicationStateService,
            ProjectSettingsService settingsService,
            InstanceIdentityService identityService,
            SystemSetupService setupService,
            SetupProgressService setupProgressService,
            BackupDestinationService backupDestinationService,
            @org.springframework.beans.factory.annotation.Value("${server.port:8082}") String port) {
        this(() -> ApplicationViews.managed(applicationStateService.snapshot()), settingsService::current, identityService::current, setupService::status, setupProgressService::status, () -> "http://" + com.autarkos.network.HostAddress.lanAddress() + ":" + port, Instant::now, backupDestinationService::current);
    }

    public SystemSummaryService(
            Supplier<List<ApplicationView>> appViews,
            Supplier<ProjectSettings> settings,
            Supplier<AutarkOsIdentity> identity,
            Supplier<SystemSetupModels.SystemSetupStatus> setupStatus,
            Supplier<String> lanUrl,
            Supplier<Instant> clock) {
        this(appViews, settings, identity, setupStatus, () -> null, lanUrl, clock, () -> null);
    }

    public SystemSummaryService(
            Supplier<List<ApplicationView>> appViews,
            Supplier<ProjectSettings> settings,
            Supplier<AutarkOsIdentity> identity,
            Supplier<SystemSetupModels.SystemSetupStatus> setupStatus,
            Supplier<SetupProgressModels.SetupProgress> setupProgress,
            Supplier<String> lanUrl,
            Supplier<Instant> clock) {
        this(appViews, settings, identity, setupStatus, setupProgress, lanUrl, clock, () -> null);
    }

    public SystemSummaryService(
            Supplier<List<ApplicationView>> appViews,
            Supplier<ProjectSettings> settings,
            Supplier<AutarkOsIdentity> identity,
            Supplier<SystemSetupModels.SystemSetupStatus> setupStatus,
            Supplier<SetupProgressModels.SetupProgress> setupProgress,
            Supplier<String> lanUrl,
            Supplier<Instant> clock,
            Supplier<BackupModels.BackupDestination> backupDestination) {
        this.appViews = appViews;
        this.settings = settings;
        this.identity = identity;
        this.setupStatus = setupStatus;
        this.setupProgress = setupProgress;
        this.lanUrl = lanUrl;
        this.clock = clock;
        this.backupDestination = backupDestination;
    }

    public SystemSummaryModels.SystemSummary summary() {
        List<ApplicationView> apps = appViews.get();
        SystemSetupModels.SystemSetupStatus setup = setupStatus.get();
        ProjectSettings currentSettings = settings.get();
        AutarkOsIdentity currentIdentity = identity.get();
        List<AutarkOsIssue> issues = issues(apps, setup);
        return new SystemSummaryModels.SystemSummary(
                currentSettings.deviceName(),
                currentIdentity.instanceId(),
                lanUrl.get(),
                setup(setup, setupProgress.get()),
                docker(setup),
                access(apps),
                apps(apps),
                backups(apps),
                storage(),
                issues,
                clock.get());
    }

    private SetupProgressModels.SetupProgressSummary setup(SystemSetupModels.SystemSetupStatus setup, SetupProgressModels.SetupProgress progress) {
        if (progress != null) {
            return new SetupProgressModels.SetupProgressSummary(
                    progress.setupComplete(),
                    progress.setupComplete() ? "complete" : "in_progress",
                    progress.lastRecommendedStep(),
                    progress.setupComplete() ? "Setup is complete." : "Setup is in progress.");
        }
        boolean complete = "ready".equals(setup.status());
        return new SetupProgressModels.SetupProgressSummary(complete, setup.status(), complete ? "done" : "host_check", setup.summary());
    }

    private SystemSummaryModels.DockerSummary docker(SystemSetupModels.SystemSetupStatus setup) {
        boolean ready = setup.dockerVersion() != null
                && !setup.dockerVersion().isBlank()
                && !"not installed".equalsIgnoreCase(setup.dockerVersion())
                && !setup.dockerVersion().contains("not reachable");
        return new SystemSummaryModels.DockerSummary(ready, ready ? "Docker is ready." : "Docker is not ready for app installs.");
    }

    private SystemSummaryModels.AccessSummary access(List<ApplicationView> apps) {
        boolean privateReady = apps.stream().anyMatch(app -> "private_ready".equals(app.accessState()));
        boolean localReady = apps.stream().anyMatch(app -> List.of("local_ready", "private_waiting", "private_needs_setup").contains(app.accessState()));
        if (privateReady) {
            return new SystemSummaryModels.AccessSummary("private_ready", "Private access is ready for at least one app.");
        }
        if (localReady) {
            return new SystemSummaryModels.AccessSummary("local_only", "Local access is ready.");
        }
        return new SystemSummaryModels.AccessSummary("not_ready", "No app access is ready yet.");
    }

    private SystemSummaryModels.AppsSummary apps(List<ApplicationView> apps) {
        List<SystemSummaryModels.ReadyAppSummary> readyToOpen = apps.stream()
                .filter(app -> app.runtime() != null && "Ready".equals(app.runtime().friendlyStatus()))
                .filter(app -> app.runtime().accessUrl() != null && !app.runtime().accessUrl().isBlank())
                .map(app -> new SystemSummaryModels.ReadyAppSummary(app.appInstanceId(), app.name(), app.runtime().accessUrl()))
                .toList();
        return new SystemSummaryModels.AppsSummary(
                apps.size(),
                (int) apps.stream().filter(app -> app.runtime() != null && AutarkOsStates.AppStatus.READY.equals(app.runtime().friendlyStatus())).count(),
                (int) apps.stream().filter(app -> app.runtime() != null && List.of(AutarkOsStates.AppStatus.MISSING, AutarkOsStates.AppStatus.NEEDS_ATTENTION, "Managed elsewhere").contains(app.runtime().friendlyStatus())).count(),
                readyToOpen);
    }

    private SystemSummaryModels.BackupSummary backups(List<ApplicationView> apps) {
        BackupModels.BackupDestination destination = backupDestination.get();
        if (destination != null && !destination.ready()) {
            return new SystemSummaryModels.BackupSummary("destination_unavailable", destination.message());
        }
        boolean needsFirstRestorePoint = apps.stream().anyMatch(app -> AutarkOsStates.BackupState.ENABLED_NO_RESTORE_POINT.equals(app.backupState()));
        boolean protectedByRestorePoint = apps.stream().anyMatch(app -> AutarkOsStates.BackupState.PROTECTED_BY_RESTORE_POINT.equals(app.backupState()));
        return needsFirstRestorePoint
                ? new SystemSummaryModels.BackupSummary("needs_restore_point", "At least one app has backups enabled but no restore point yet.")
                : protectedByRestorePoint
                    ? new SystemSummaryModels.BackupSummary("protected_by_restore_point", "Every managed app with backups enabled has a restore point.")
                    : new SystemSummaryModels.BackupSummary("not_configured", "No restore point is required yet.");
    }

    private SystemSummaryModels.StorageSummary storage() {
        return new SystemSummaryModels.StorageSummary("unknown", "Storage details are available from the Storage page.");
    }

    private List<AutarkOsIssue> issues(List<ApplicationView> apps, SystemSetupModels.SystemSetupStatus setup) {
        java.util.ArrayList<AutarkOsIssue> issues = new java.util.ArrayList<>();
        if (!docker(setup).ready()) {
            issues.add(AutarkOsIssueFactory.systemIssue(
                    "docker-unavailable",
                    "critical",
                    "docker_unavailable",
                    "Docker is not ready",
                    "Autark-OS needs Docker before it can install or repair apps.",
                    AutarkOsAction.route("open-diagnostics", "View diagnostics", "/diagnostics")));
        }
        apps.stream().flatMap(app -> app.issues().stream()).forEach(issues::add);
        return issues;
    }
}

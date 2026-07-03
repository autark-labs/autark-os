package com.autarkos.system;

import java.time.Instant;
import java.util.List;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.apps.ApplicationStateService;
import com.autarkos.api.AutarkOsAction;
import com.autarkos.api.AutarkOsIssue;
import com.autarkos.api.AutarkOsIssueFactory;
import com.autarkos.marketplace.install.AppInstanceView;
import com.autarkos.system.api.SystemSetupStatus;

@Service
public class SystemSummaryService implements SystemSummaryProvider {

    private final Supplier<List<AppInstanceView>> appViews;
    private final Supplier<ProjectSettings> settings;
    private final Supplier<AutarkOsIdentity> identity;
    private final Supplier<SystemSetupStatus> setupStatus;
    private final Supplier<SetupProgress> setupProgress;
    private final Supplier<String> lanUrl;
    private final Supplier<Instant> clock;

    @Autowired
    public SystemSummaryService(
            ApplicationStateService applicationStateService,
            ProjectSettingsService settingsService,
            InstanceIdentityService identityService,
            SystemSetupService setupService,
            SetupProgressService setupProgressService) {
        this(() -> applicationStateService.snapshot().managedApps(), settingsService::current, identityService::current, setupService::status, setupProgressService::status, () -> "http://localhost:8082", Instant::now);
    }

    public SystemSummaryService(
            Supplier<List<AppInstanceView>> appViews,
            Supplier<ProjectSettings> settings,
            Supplier<AutarkOsIdentity> identity,
            Supplier<SystemSetupStatus> setupStatus,
            Supplier<String> lanUrl,
            Supplier<Instant> clock) {
        this(appViews, settings, identity, setupStatus, () -> null, lanUrl, clock);
    }

    public SystemSummaryService(
            Supplier<List<AppInstanceView>> appViews,
            Supplier<ProjectSettings> settings,
            Supplier<AutarkOsIdentity> identity,
            Supplier<SystemSetupStatus> setupStatus,
            Supplier<SetupProgress> setupProgress,
            Supplier<String> lanUrl,
            Supplier<Instant> clock) {
        this.appViews = appViews;
        this.settings = settings;
        this.identity = identity;
        this.setupStatus = setupStatus;
        this.setupProgress = setupProgress;
        this.lanUrl = lanUrl;
        this.clock = clock;
    }

    public SystemSummary summary() {
        List<AppInstanceView> apps = appViews.get();
        SystemSetupStatus setup = setupStatus.get();
        ProjectSettings currentSettings = settings.get();
        AutarkOsIdentity currentIdentity = identity.get();
        List<AutarkOsIssue> issues = issues(apps, setup);
        return new SystemSummary(
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

    private SetupProgressSummary setup(SystemSetupStatus setup, SetupProgress progress) {
        if (progress != null) {
            return new SetupProgressSummary(
                    progress.setupComplete(),
                    progress.setupComplete() ? "complete" : "in_progress",
                    progress.lastRecommendedStep(),
                    progress.setupComplete() ? "Setup is complete." : "Setup is in progress.");
        }
        boolean complete = "ready".equals(setup.status());
        return new SetupProgressSummary(complete, setup.status(), complete ? "done" : "host_check", setup.summary());
    }

    private DockerSummary docker(SystemSetupStatus setup) {
        boolean ready = setup.dockerVersion() != null
                && !setup.dockerVersion().isBlank()
                && !"not installed".equalsIgnoreCase(setup.dockerVersion())
                && !setup.dockerVersion().contains("not reachable");
        return new DockerSummary(ready, ready ? "Docker is ready." : "Docker is not ready for app installs.");
    }

    private AccessSummary access(List<AppInstanceView> apps) {
        boolean privateReady = apps.stream().anyMatch(app -> "private_ready".equals(app.accessState()));
        boolean localReady = apps.stream().anyMatch(app -> "local_ready".equals(app.accessState()));
        if (privateReady) {
            return new AccessSummary("private_ready", "Private access is ready for at least one app.");
        }
        if (localReady) {
            return new AccessSummary("local_only", "Local access is ready.");
        }
        return new AccessSummary("not_ready", "No app access is ready yet.");
    }

    private AppsSummary apps(List<AppInstanceView> apps) {
        List<ReadyAppSummary> readyToOpen = apps.stream()
                .filter(app -> "Ready".equals(app.userStatus()))
                .filter(app -> app.localUrl() != null && !app.localUrl().isBlank())
                .map(app -> new ReadyAppSummary(app.appInstanceId(), app.name(), app.localUrl()))
                .toList();
        return new AppsSummary(
                apps.size(),
                (int) apps.stream().filter(app -> "Ready".equals(app.userStatus())).count(),
                (int) apps.stream().filter(app -> List.of("Missing", "Needs attention", "Managed elsewhere").contains(app.userStatus())).count(),
                readyToOpen);
    }

    private BackupSummary backups(List<AppInstanceView> apps) {
        boolean needsFirstRestorePoint = apps.stream().anyMatch(app -> "backup_enabled_no_restore_point".equals(app.backupState()));
        return needsFirstRestorePoint
                ? new BackupSummary("needs_restore_point", "At least one app has backups enabled but no restore point yet.")
                : new BackupSummary("not_configured", "No restore point is required yet.");
    }

    private StorageSummary storage() {
        return new StorageSummary("unknown", "Storage details are available from the Storage page.");
    }

    private List<AutarkOsIssue> issues(List<AppInstanceView> apps, SystemSetupStatus setup) {
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

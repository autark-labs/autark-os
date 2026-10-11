package com.autarkos.backups;

import java.nio.file.Path;
import java.time.Instant;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.system.ProjectSettings;
import com.autarkos.system.ProjectSettingsService;
import com.autarkos.system.RuntimeFileOperations;

class BackupReportService {

    private final InstalledAppRepository installedAppRepository;
    private final BackupRepository backupRepository;
    private final ProjectSettingsService projectSettingsService;
    private final MarketplaceCatalogService catalogService;
    private final RuntimeFileOperations fileOperations;
    private final BackupContractService backupContractService;
    private final Supplier<Path> backupRoot;
    private final BackupDestinationService destinationService;
    private final AutarkOsJobService jobs;
    private final java.util.function.Function<InstalledApp, String> backupUnavailableReason;

    BackupReportService(
            InstalledAppRepository installedAppRepository,
            BackupRepository backupRepository,
            ProjectSettingsService projectSettingsService,
            MarketplaceCatalogService catalogService,
            RuntimeFileOperations fileOperations,
            BackupContractService backupContractService,
            Supplier<Path> backupRoot,
            BackupDestinationService destinationService, java.util.function.Function<InstalledApp, String> backupUnavailableReason,
            AutarkOsJobService jobs) {
        this.installedAppRepository = installedAppRepository;
        this.backupRepository = backupRepository;
        this.projectSettingsService = projectSettingsService;
        this.catalogService = catalogService;
        this.fileOperations = fileOperations;
        this.backupContractService = backupContractService;
        this.backupRoot = backupRoot;
        this.destinationService = destinationService;
        this.jobs = jobs;
        this.backupUnavailableReason = backupUnavailableReason;
    }

    BackupModels.BackupReport report(List<InstalledApp> installedApps) {
        Map<String, ApplicationManifest> manifestsById = catalogService.findAll().stream()
                .collect(java.util.stream.Collectors.toMap(ApplicationManifest::id, manifest -> manifest));
        List<BackupModels.AppBackupStatus> apps = installedApps.stream()
                .map(app -> appStatus(app, manifestsById))
                .sorted(Comparator.comparing(BackupModels.AppBackupStatus::appName))
                .toList();
        List<RestorePoint> recent = backupRepository.recent(20).stream()
                .map(RestorePoints::toDomain)
                .toList();
        int protectedApps = (int) apps.stream().filter(BackupModels.AppBackupStatus::protectedByBackups).count();
        int failedBackups = (int) recent.stream()
                .filter(point -> AutarkOsStates.RestorePointStatus.FAILED.equals(point.status())
                        || AutarkOsStates.RestorePointStatus.FAILED.equals(point.verificationStatus()))
                .count();
        BackupModels.BackupDestination destination = destinationService.current();
        long backupStorage = destination.ready() ? fileOperations.measuredDirectorySize(Path.of(destination.configuredPath())) : -1;
        String status = destination.ready() ? status(apps, failedBackups) : "warning";
        ProjectSettings settings = projectSettingsService.current();
        RestorePoint lastRoutine = backupRepository.latestRoutine(false).map(RestorePoints::toDomain).orElse(null);
        RestorePoint lastSuccessfulRoutine = backupRepository.latestRoutine(true).map(RestorePoints::toDomain).orElse(null);
        RestorePoint lastSuccessfulVerification = backupRepository.latestSuccessfulVerification().map(RestorePoints::toDomain).orElse(null);

        AutarkOsJob lastScheduledJob = jobs.latestScheduledJob(AutarkOsStates.JobType.BACKUP, "__routine__").orElse(null);

        return new BackupModels.BackupReport(
                status,
                headline(status, destination),
                summary(installedApps.size(), protectedApps, failedBackups, destination),
                new BackupModels.BackupSettingsSummary(
                        settings.automaticBackupsEnabled(),
                        settings.backupFrequency(),
                        settings.backupRetentionDays(),
                        settings.backupTime(),
                        settings.timeZone(),
                        nextRunLabel(settings),
                        schedulerHealth(settings, lastScheduledJob, destination),
                        schedulerMessage(settings, lastScheduledJob, destination),
                        lastRoutine,
                        lastSuccessfulRoutine,
                        lastSuccessfulVerification,
                        nextRoutineRun(settings, Instant.now())),
                installedApps.size(),
                protectedApps,
                installedApps.size() - protectedApps,
                failedBackups,
                backupStorage,
                destination.configuredPath(),
                apps,
                recent,
                destination,
                Instant.now());
    }

    String nextRoutineRun(ProjectSettings settings, Instant now) {
        if (!settings.automaticBackupsEnabled()) return "";
        Instant candidate = calendarWindow(settings, now);
        if (!candidate.isAfter(now)) {
            var job = jobs.findById(AutarkOsJobService.onceJobId(windowKey(settings, candidate)));
            if (job.isPresent() && List.of("succeeded", "failed", "cancelled").contains(job.get().status())) {
                candidate = nextWindow(settings, candidate);
            }
        }
        return candidate.toString();
    }

    record RoutineWindow(Instant startsAt, String key) { }

    static Optional<RoutineWindow> routineWindow(ProjectSettings settings, Instant now) {
        if (!settings.automaticBackupsEnabled()) return Optional.empty();
        Instant candidate = calendarWindow(settings, now);
        return candidate.isAfter(now) ? Optional.empty()
                : Optional.of(new RoutineWindow(candidate, windowKey(settings, candidate)));
    }

    private static String windowKey(ProjectSettings settings, Instant candidate) {
        return "routine:" + settings.backupFrequency() + ":" + settings.timeZone() + ":" + settings.backupTime() + ":" + candidate;
    }

    // No historical catch-up on first enable. Daily/weekly windows use local calendar
    // time; DST gaps move forward, overlaps use the earlier offset exactly once.
    // Hourly windows follow elapsed hours and therefore include both repeated hours.
    private static Instant calendarWindow(ProjectSettings settings, Instant now) {
        ZoneId zone = ZoneId.of(settings.timeZone());
        ZonedDateTime local = now.atZone(zone);
        LocalTime time = parseBackupTime(settings.backupTime());
        if ("hourly".equals(settings.backupFrequency())) {
            ZonedDateTime candidate = local.withMinute(time.getMinute()).withSecond(0).withNano(0);
            return (candidate.toInstant().isAfter(now) ? candidate.minusHours(1) : candidate).toInstant();
        }
        LocalDate date = "weekly".equals(settings.backupFrequency())
                ? local.toLocalDate().with(java.time.temporal.TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
                : local.toLocalDate();
        return ZonedDateTime.of(date, time, zone).toInstant();
    }

    private static Instant nextWindow(ProjectSettings settings, Instant candidate) {
        ZoneId zone = ZoneId.of(settings.timeZone());
        ZonedDateTime local = candidate.atZone(zone);
        if ("hourly".equals(settings.backupFrequency())) return local.plusHours(1).toInstant();
        LocalDate date = "weekly".equals(settings.backupFrequency())
                ? local.toLocalDate().plusWeeks(1) : local.toLocalDate().plusDays(1);
        return ZonedDateTime.of(date, parseBackupTime(settings.backupTime()), zone).toInstant();
    }

    private BackupModels.AppBackupStatus appStatus(InstalledApp app, Map<String, ApplicationManifest> manifestsById) {
        Optional<InstallModels.InstallSettings> settings = installedAppRepository.settingsFor(app.appId());
        InstallModels.BackupPolicy policy = settings.map(InstallModels.InstallSettings::backup).orElse(InstallModels.BackupPolicy.defaults());
        List<RestorePoint> restorePoints = backupRepository.containingApp(app.appId()).stream()
                .map(RestorePoints::toDomain)
                .toList();
        RestorePoint latest = restorePoints.stream().findFirst().orElse(null);
        long dataSize = fileOperations.directorySize(Path.of(app.runtimePath()));
        BackupModels.BackupContract contract = backupContractService.backupContract(app, manifestsById.get(app.appId()));
        String backupUnavailableReason = this.backupUnavailableReason.apply(app);
        boolean backupAvailable = backupUnavailableReason.isBlank();
        boolean protectedByBackups = AutarkOsStates.BackupState.PROTECTED_BY_RESTORE_POINT.equals(
                BackupProtectionPolicy.state(policy.enabled(), manifestsById.get(app.appId()), restorePoints));
        String status = protectedByBackups ? "protected" : appBackupStatus(policy, latest, contract, backupAvailable);
        return new BackupModels.AppBackupStatus(
                app.appId(),
                app.appName(),
                status,
                "protected".equals(status),
                projectSettingsService.current().backupFrequency(),
                policy.retention(),
                Math.toIntExact(Math.min(
                        Integer.MAX_VALUE,
                        restorePoints.size())),
                contract,
                app.runtimePath(),
                dataSize,
                latest,
                restorePoints,
                protectedByBackups ? "Protected by a compatible verified restore point. The latest attempt is shown separately."
                        : statusMessage(policy, latest, contract, backupAvailable, backupUnavailableReason),
                backupAvailable,
                backupUnavailableReason,
                nextBackup(policy),
                Instant.now());
    }

    private String appBackupStatus(InstallModels.BackupPolicy policy, RestorePoint latest, BackupModels.BackupContract contract, boolean backupAvailable) {
        if (contract.reviewRequired()) return "needs_backup_review";
        if (!backupAvailable) {
            return "recovery_limited";
        }
        if (!policy.enabled()) {
            return "unprotected";
        }
        if (latest == null) {
            return "not_backed_up";
        }
        if (AutarkOsStates.RestorePointStatus.FAILED.equals(latest.status())) {
            return AutarkOsStates.RestorePointStatus.FAILED;
        }
        return "not_backed_up";
    }

    private String statusMessage(InstallModels.BackupPolicy policy, RestorePoint latest, BackupModels.BackupContract contract, boolean backupAvailable, String backupUnavailableReason) {
        if (!backupAvailable) {
            return backupUnavailableReason;
        }
        if (!policy.enabled()) {
            return "Excluded from the routine. You can still create a manual backup.";
        }
        if (contract.reviewRequired()) {
            return "Needs backup review: " + contract.summary();
        }
        if (latest == null) {
            return "No restore point yet.";
        }
        if (AutarkOsStates.RestorePointStatus.FAILED.equals(latest.status())) {
            return latest.message();
        }
        if (AutarkOsStates.RestorePointStatus.COMPLETED.equals(latest.status())
                && AutarkOsStates.RestorePointStatus.VERIFIED.equals(latest.verificationStatus())
                && !contract.reviewRequired()) {
            return "This restore point is not compatible with the current app backup contract. Create a new backup.";
        }
        if ("legacy_unverified".equals(latest.verificationStatus())) {
            return "This is a legacy restore point without an immutable integrity baseline. Create a new backup before relying on it.";
        }
        if (AutarkOsStates.RestorePointStatus.COMPLETED.equals(latest.status())) {
            return "A restore point exists, but it is not verified yet.";
        }
        return "No completed restore point yet.";
    }

    private String nextRunLabel(ProjectSettings settings) {
        if (!settings.automaticBackupsEnabled()) {
            return "Automatic backups are off";
        }
        return switch (settings.backupFrequency()) {
            case "hourly" -> "Hourly at minute " + parseBackupTime(settings.backupTime()).getMinute() + " · " + settings.timeZone();
            case "weekly" -> "Mondays at " + settings.backupTime() + " " + settings.timeZone();
            default -> "Daily at " + settings.backupTime() + " " + settings.timeZone();
        };
    }

    private String schedulerHealth(ProjectSettings settings, AutarkOsJob lastScheduledJob, BackupModels.BackupDestination destination) {
        if (!settings.automaticBackupsEnabled()) {
            return "off";
        }
        if (!destination.ready()) {
            return "warning";
        }
        if (lastScheduledJob != null && "failed".equals(lastScheduledJob.status())) {
            return "warning";
        }
        return "healthy";
    }

    private String schedulerMessage(ProjectSettings settings, AutarkOsJob lastScheduledJob, BackupModels.BackupDestination destination) {
        if (!settings.automaticBackupsEnabled()) {
            return "Automatic backups are turned off in Settings.";
        }
        if (!destination.ready()) {
            return destination.message();
        }
        if (lastScheduledJob != null && "failed".equals(lastScheduledJob.status())) {
            return "The latest scheduled backup failed or was interrupted. Review its saved progress in Activity. You can run a routine backup now; the next scheduled window is unchanged.";
        }
        return "Routine windows run once. Busy windows wait; failed or interrupted attempts remain in Activity and the next window runs normally. Manual backups do not change this schedule.";
    }

    private static LocalTime parseBackupTime(String value) {
        if (value == null || value.isBlank()) {
            return LocalTime.of(2, 0);
        }
        try {
            return LocalTime.parse(value);
        } catch (RuntimeException exception) {
            return LocalTime.of(2, 0);
        }
    }

    private String nextBackup(InstallModels.BackupPolicy policy) {
        if (!policy.enabled()) {
            return "Not scheduled";
        }
        return nextRunLabel(projectSettingsService.current());
    }

    private String status(List<BackupModels.AppBackupStatus> apps, int failedBackups) {
        if (failedBackups > 0) {
            return "warning";
        }
        if (apps.stream().anyMatch(app -> !app.protectedByBackups() || "not_backed_up".equals(app.status()))) {
            return "attention";
        }
        return "protected";
    }

    private String headline(String status, BackupModels.BackupDestination destination) {
        if (!destination.ready()) {
            return "Backup destination needs attention";
        }
        return switch (status) {
            case "protected" -> "Backups look ready";
            case "warning" -> "A backup needs attention";
            default -> "Some apps need a backup";
        };
    }

    private String summary(int totalApps, int protectedApps, int failedBackups, BackupModels.BackupDestination destination) {
        if (!destination.ready()) {
            return destination.message() + " Reconnect or update the destination before creating another backup.";
        }
        if (totalApps == 0) {
            return "Install apps to begin backup protection.";
        }
        if (failedBackups > 0) {
            return failedBackups + " recent backup failure" + (failedBackups == 1 ? "" : "s") + " recorded.";
        }
        return protectedApps + " of " + totalApps + " apps are protected by a verified restore point.";
    }
}

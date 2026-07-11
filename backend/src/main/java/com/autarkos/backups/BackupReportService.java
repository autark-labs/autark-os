package com.autarkos.backups;

import java.nio.file.Path;
import java.time.Instant;
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

    BackupReportService(
            InstalledAppRepository installedAppRepository,
            BackupRepository backupRepository,
            ProjectSettingsService projectSettingsService,
            MarketplaceCatalogService catalogService,
            RuntimeFileOperations fileOperations,
            BackupContractService backupContractService,
            Supplier<Path> backupRoot) {
        this.installedAppRepository = installedAppRepository;
        this.backupRepository = backupRepository;
        this.projectSettingsService = projectSettingsService;
        this.catalogService = catalogService;
        this.fileOperations = fileOperations;
        this.backupContractService = backupContractService;
        this.backupRoot = backupRoot;
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
        int failedBackups = (int) recent.stream().filter(point -> AutarkOsStates.RestorePointStatus.FAILED.equals(point.status())).count();
        long backupStorage = fileOperations.directorySize(backupRoot.get());
        String status = status(apps, failedBackups);
        ProjectSettings settings = projectSettingsService.current();
        RestorePoint lastRoutine = recent.stream()
                .filter(point -> "automatic".equals(point.source()))
                .findFirst()
                .orElse(null);
        RestorePoint lastSuccessfulRoutine = recent.stream()
                .filter(point -> "automatic".equals(point.source()) && AutarkOsStates.RestorePointStatus.COMPLETED.equals(point.status()))
                .findFirst()
                .orElse(null);
        RestorePoint lastSuccessfulVerification = recent.stream()
                .filter(point -> AutarkOsStates.RestorePointStatus.VERIFIED.equals(point.verificationStatus()))
                .findFirst()
                .orElse(null);

        return new BackupModels.BackupReport(
                status,
                headline(status),
                summary(installedApps.size(), protectedApps, failedBackups),
                new BackupModels.BackupSettingsSummary(
                        settings.automaticBackupsEnabled(),
                        settings.backupFrequency(),
                        settings.backupRetentionDays(),
                        settings.backupTime(),
                        settings.timeZone(),
                        nextRunLabel(settings),
                        schedulerHealth(settings, lastRoutine),
                        schedulerMessage(settings, lastRoutine),
                        lastRoutine,
                        lastSuccessfulRoutine,
                        lastSuccessfulVerification,
                        nextRoutineRun(settings, lastRoutine)),
                installedApps.size(),
                protectedApps,
                installedApps.size() - protectedApps,
                failedBackups,
                backupStorage,
                backupRoot.get().toString(),
                apps,
                recent,
                Instant.now());
    }

    String nextRoutineRun(ProjectSettings settings, RestorePoint lastRoutine) {
        return nextRoutineRun(settings, lastRoutine, Instant.now());
    }

    String nextRoutineRun(ProjectSettings settings, RestorePoint lastRoutine, Instant now) {
        if (!settings.automaticBackupsEnabled()) {
            return "";
        }
        Instant candidate = scheduledWindow(settings, lastRoutine, now);
        while (!candidate.isAfter(now)) {
            candidate = advance(settings, candidate);
        }
        return candidate.toString();
    }

    boolean routineBackupDue(ProjectSettings settings, RestorePoint lastRoutine, Instant now) {
        return settings.automaticBackupsEnabled() && !scheduledWindow(settings, lastRoutine, now).isAfter(now);
    }

    private BackupModels.AppBackupStatus appStatus(InstalledApp app, Map<String, ApplicationManifest> manifestsById) {
        Optional<InstallModels.InstallSettings> settings = installedAppRepository.settingsFor(app.appId());
        InstallModels.BackupPolicy policy = settings.map(InstallModels.InstallSettings::backup).orElse(InstallModels.BackupPolicy.defaults());
        List<RestorePoint> restorePoints = backupRepository.forApp(app.appId(), 5).stream()
                .map(RestorePoints::toDomain)
                .toList();
        RestorePoint latest = restorePoints.stream().findFirst().orElse(null);
        long dataSize = fileOperations.directorySize(Path.of(app.runtimePath()));
        BackupModels.BackupContract contract = backupContractService.backupContract(app, manifestsById.get(app.appId()));
        String status = appBackupStatus(policy, latest, contract);
        return new BackupModels.AppBackupStatus(
                app.appId(),
                app.appName(),
                status,
                "protected".equals(status),
                policy.frequency(),
                policy.retention(),
                contract,
                app.runtimePath(),
                dataSize,
                latest,
                restorePoints,
                statusMessage(policy, latest, contract),
                nextBackup(policy),
                Instant.now());
    }

    private String appBackupStatus(InstallModels.BackupPolicy policy, RestorePoint latest, BackupModels.BackupContract contract) {
        if (!policy.enabled()) {
            return "unprotected";
        }
        if (contract.reviewRequired()) {
            return "needs_backup_review";
        }
        if (latest == null) {
            return "not_backed_up";
        }
        if (AutarkOsStates.RestorePointStatus.FAILED.equals(latest.status())) {
            return AutarkOsStates.RestorePointStatus.FAILED;
        }
        if (AutarkOsStates.RestorePointStatus.COMPLETED.equals(latest.status())) {
            return "protected";
        }
        return "not_backed_up";
    }

    private String statusMessage(InstallModels.BackupPolicy policy, RestorePoint latest, BackupModels.BackupContract contract) {
        if (!policy.enabled()) {
            return "Backups are off.";
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
        if (AutarkOsStates.RestorePointStatus.COMPLETED.equals(latest.status())) {
            return "Protected by restore point.";
        }
        return "No completed restore point yet.";
    }

    private String nextRunLabel(ProjectSettings settings) {
        if (!settings.automaticBackupsEnabled()) {
            return "Automatic backups are off";
        }
        return "Next " + settings.backupFrequency() + " backup near " + settings.backupTime() + " " + settings.timeZone();
    }

    private Instant scheduledWindow(ProjectSettings settings, RestorePoint lastRoutine, Instant now) {
        ZoneId zone = ZoneId.of(settings.timeZone());
        LocalDate startDate = lastRoutine == null
                ? ZonedDateTime.ofInstant(now, zone).toLocalDate()
                : ZonedDateTime.ofInstant(lastRoutine.createdAt(), zone).toLocalDate();
        LocalDate scheduledDate = switch (settings.backupFrequency()) {
            case "weekly" -> lastRoutine == null ? startDate : startDate.plusWeeks(1);
            case "daily" -> lastRoutine == null ? startDate : startDate.plusDays(1);
            default -> startDate;
        };
        Instant candidate = ZonedDateTime.of(scheduledDate, parseBackupTime(settings.backupTime()), zone).toInstant();
        if (lastRoutine == null) {
            return candidate;
        }
        while (!candidate.isAfter(lastRoutine.createdAt())) {
            candidate = advance(settings, candidate);
        }
        return candidate;
    }

    private Instant advance(ProjectSettings settings, Instant candidate) {
        ZoneId zone = ZoneId.of(settings.timeZone());
        ZonedDateTime localCandidate = ZonedDateTime.ofInstant(candidate, zone);
        return switch (settings.backupFrequency()) {
            case "weekly" -> localCandidate.plusWeeks(1).toInstant();
            case "daily" -> localCandidate.plusDays(1).toInstant();
            default -> localCandidate.plusHours(1).toInstant();
        };
    }

    private String schedulerHealth(ProjectSettings settings, RestorePoint lastRoutine) {
        if (!settings.automaticBackupsEnabled()) {
            return "off";
        }
        if (lastRoutine != null && AutarkOsStates.RestorePointStatus.FAILED.equals(lastRoutine.status())) {
            return "warning";
        }
        return "healthy";
    }

    private String schedulerMessage(ProjectSettings settings, RestorePoint lastRoutine) {
        if (!settings.automaticBackupsEnabled()) {
            return "Automatic backups are turned off in Settings.";
        }
        if (lastRoutine != null && AutarkOsStates.RestorePointStatus.FAILED.equals(lastRoutine.status())) {
            return "The latest routine backup failed: " + lastRoutine.message();
        }
        return "Routine backups are scheduled in the background. Autark-OS records these runs separately from manual checkpoints.";
    }

    private LocalTime parseBackupTime(String value) {
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
        return "Next " + policy.frequency() + " window";
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

    private String headline(String status) {
        return switch (status) {
            case "protected" -> "Backups look ready";
            case "warning" -> "A backup needs attention";
            default -> "Some apps need a backup";
        };
    }

    private String summary(int totalApps, int protectedApps, int failedBackups) {
        if (totalApps == 0) {
            return "Install apps to begin backup protection.";
        }
        if (failedBackups > 0) {
            return failedBackups + " recent backup failure" + (failedBackups == 1 ? "" : "s") + " recorded.";
        }
        return protectedApps + " of " + totalApps + " apps are protected by a restore point.";
    }
}

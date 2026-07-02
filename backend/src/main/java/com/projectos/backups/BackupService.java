package com.projectos.backups;

import java.io.IOException;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.projectos.activity.ActivityLogService;
import com.projectos.fileops.LocalProjectOsFileOperations;
import com.projectos.fileops.ProjectOsFileOpsService;
import com.projectos.marketplace.catalog.MarketplaceCatalogService;
import com.projectos.marketplace.install.AppActionResult;
import com.projectos.marketplace.install.AppLifecycleService;
import com.projectos.marketplace.install.AppInstanceView;
import com.projectos.marketplace.install.AppInstanceViewProvider;
import com.projectos.marketplace.install.AppRemediationView;
import com.projectos.marketplace.install.BackupPolicy;
import com.projectos.marketplace.install.InstallSettings;
import com.projectos.marketplace.install.InstallationException;
import com.projectos.marketplace.install.InstalledApp;
import com.projectos.marketplace.install.InstalledAppRepository;
import com.projectos.marketplace.model.ApplicationManifest;
import com.projectos.marketplace.runtime.RuntimeLayout;
import com.projectos.system.ProjectSettings;
import com.projectos.system.ProjectSettingsRepository;
import com.projectos.system.ProjectSettingsService;
import com.projectos.system.RuntimeFileOperations;

@Service
public class BackupService {

    private static final long BACKUP_FREE_SPACE_BUFFER_BYTES = 512L * 1024L * 1024L;
    private static final DateTimeFormatter BACKUP_NAME_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);
    private final AtomicBoolean automaticBackupRunning = new AtomicBoolean(false);

    private final RuntimeLayout runtimeLayout;
    private final InstalledAppRepository installedAppRepository;
    private final BackupRepository backupRepository;
    private final ActivityLogService activityLogService;
    private final ProjectSettingsRepository settingsRepository;
    private final ProjectSettingsService projectSettingsService;
    private final AppLifecycleService appLifecycleService;
    private final MarketplaceCatalogService catalogService;
    private final AppInstanceViewProvider appInstanceViewProvider;
    private final RuntimeFileOperations fileOperations;
    private final ProjectOsFileOpsService fileOpsService;

    public BackupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedAppRepository, BackupRepository backupRepository, ActivityLogService activityLogService, ProjectSettingsRepository settingsRepository, ProjectSettingsService projectSettingsService, AppLifecycleService appLifecycleService, MarketplaceCatalogService catalogService) {
        this(runtimeLayout, installedAppRepository, backupRepository, activityLogService, settingsRepository, projectSettingsService, appLifecycleService, catalogService, () -> installedAppRepository.findAll().stream()
                .map(app -> new AppInstanceView(
                        app.appId(),
                        app.appId(),
                        app.appName(),
                        "",
                        "",
                        app.status(),
                        app.status(),
                        app.status(),
                        "owned",
                        app.accessUrl() == null || app.accessUrl().isBlank() ? "not_ready" : "local_ready",
                        "backup_disabled",
                        app.accessUrl(),
                        null,
                        List.of(),
                        List.of(),
                        new AppRemediationView("watching", "Project OS is watching", app.appName() + " is ready. If it drifts, Project OS will try safe repair before asking you to intervene.", "No action needed", "success"),
                        Instant.now()))
                .toList(), new RuntimeFileOperations());
    }

    public BackupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedAppRepository, BackupRepository backupRepository, ActivityLogService activityLogService, ProjectSettingsRepository settingsRepository, ProjectSettingsService projectSettingsService, AppLifecycleService appLifecycleService, MarketplaceCatalogService catalogService, AppInstanceViewProvider appInstanceViewProvider, RuntimeFileOperations fileOperations) {
        this(runtimeLayout, installedAppRepository, backupRepository, activityLogService, settingsRepository, projectSettingsService, appLifecycleService, catalogService, appInstanceViewProvider, fileOperations, new ProjectOsFileOpsService(runtimeLayout, new LocalProjectOsFileOperations()));
    }

    @Autowired
    public BackupService(RuntimeLayout runtimeLayout, InstalledAppRepository installedAppRepository, BackupRepository backupRepository, ActivityLogService activityLogService, ProjectSettingsRepository settingsRepository, ProjectSettingsService projectSettingsService, AppLifecycleService appLifecycleService, MarketplaceCatalogService catalogService, AppInstanceViewProvider appInstanceViewProvider, RuntimeFileOperations fileOperations, ProjectOsFileOpsService fileOpsService) {
        this.runtimeLayout = runtimeLayout;
        this.installedAppRepository = installedAppRepository;
        this.backupRepository = backupRepository;
        this.activityLogService = activityLogService;
        this.settingsRepository = settingsRepository;
        this.projectSettingsService = projectSettingsService;
        this.appLifecycleService = appLifecycleService;
        this.catalogService = catalogService;
        this.appInstanceViewProvider = appInstanceViewProvider;
        this.fileOperations = fileOperations;
        this.fileOpsService = fileOpsService;
    }

    public BackupReport report() {
        List<InstalledApp> installedApps = managedInstalledApps();
        Map<String, ApplicationManifest> manifestsById = catalogService.findAll().stream()
                .collect(java.util.stream.Collectors.toMap(ApplicationManifest::id, manifest -> manifest));
        List<AppBackupStatus> apps = installedApps.stream()
                .map(app -> appStatus(app, manifestsById))
                .sorted(Comparator.comparing(AppBackupStatus::appName))
                .toList();
        List<RestorePoint> recent = backupRepository.recent(20);
        int protectedApps = (int) apps.stream().filter(AppBackupStatus::protectedByBackups).count();
        int failedBackups = (int) recent.stream().filter(point -> "failed".equals(point.status())).count();
        long backupStorage = fileOperations.directorySize(backupRoot());
        String status = status(apps, failedBackups);
        ProjectSettings settings = projectSettingsService.current();
        RestorePoint lastRoutine = recent.stream()
                .filter(point -> "automatic".equals(point.source()))
                .findFirst()
                .orElse(null);
        RestorePoint lastSuccessfulRoutine = recent.stream()
                .filter(point -> "automatic".equals(point.source()) && "completed".equals(point.status()))
                .findFirst()
                .orElse(null);
        RestorePoint lastSuccessfulVerification = recent.stream()
                .filter(point -> "verified".equals(point.verificationStatus()))
                .findFirst()
                .orElse(null);
        return new BackupReport(
                status,
                headline(status),
                summary(installedApps.size(), protectedApps, failedBackups),
                new BackupSettingsSummary(
                        settings.automaticBackupsEnabled(),
                        settings.backupFrequency(),
                        settings.backupRetentionDays(),
                        settings.backupTime(),
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
                backupRoot().toString(),
                apps,
                recent,
                Instant.now());
    }

    public BackupRunResult run(String appId) {
        return runAppBackup(appId, "manual");
    }

    public BackupRunResult runAutomatic() {
        ProjectSettings settings = projectSettingsService.current();
        if (!settings.automaticBackupsEnabled()) {
            RestorePoint point = backupRepository.record("__full__", "All apps", "full", "automatic", "", "", "failed", 0, "Automatic backups are turned off.");
            return new BackupRunResult("__full__", "All apps", "failed", point.message(), point, Instant.now());
        }
        return runFullBackup("automatic");
    }

    public Optional<BackupRunResult> runAutomaticIfDue() {
        ProjectSettings settings = projectSettingsService.current();
        if (!settings.automaticBackupsEnabled()) {
            return Optional.empty();
        }
        RestorePoint lastRoutine = backupRepository.recent(50).stream()
                .filter(point -> "automatic".equals(point.source()))
                .findFirst()
                .orElse(null);
        String nextRun = nextRoutineRun(settings, lastRoutine);
        if (nextRun.isBlank() || Instant.parse(nextRun).isAfter(Instant.now())) {
            return Optional.empty();
        }
        if (!automaticBackupRunning.compareAndSet(false, true)) {
            return Optional.empty();
        }
        try {
            activityLogService.info("backup", "scheduled_backup_due", "Routine backup started", "Project OS started the scheduled routine backup window.");
            return Optional.of(runAutomatic());
        } finally {
            automaticBackupRunning.set(false);
        }
    }

    public BackupRunResult runFullBackup(String source) {
        List<InstalledApp> apps = managedInstalledApps();
        List<InstalledApp> protectedApps = apps.stream()
                .filter(app -> installedAppRepository.settingsFor(app.appId()).map(InstallSettings::backup).orElse(BackupPolicy.defaults()).enabled())
                .toList();
        if (protectedApps.isEmpty()) {
            RestorePoint point = backupRepository.record("__full__", "All apps", "full", cleanSource(source), "", "", "failed", 0, "No apps are currently eligible for backup.");
            return new BackupRunResult("__full__", "All apps", "failed", point.message(), point, Instant.now());
        }
        try {
            Files.createDirectories(backupRoot().resolve("full"));
            Path destination = backupRoot().resolve("full").resolve("project-os-full-" + BACKUP_NAME_FORMAT.format(Instant.now()) + ".zip");
            validateFullBackup(protectedApps);
            long size = zipApps(protectedApps, destination);
            String included = protectedApps.stream().map(InstalledApp::appId).collect(java.util.stream.Collectors.joining(","));
            RestorePoint point = backupRepository.record("__full__", "All apps", "full", cleanSource(source), included, destination.toString(), "completed", size, "Full backup completed for " + protectedApps.size() + " app(s).");
            point = verifyRestorePoint(point).restorePoint();
            activityLogService.success("backup", cleanSource(source) + "_full_backup", "Full backup completed", point.message(), null);
            protectedApps.forEach(app -> installedAppRepository.recordEvent(app.appId(), "backup_completed", "Included in full " + cleanSource(source) + " backup."));
            return new BackupRunResult("__full__", "All apps", "completed", point.message(), point, Instant.now());
        } catch (RuntimeException | IOException exception) {
            RestorePoint point = backupRepository.record("__full__", "All apps", "full", cleanSource(source), protectedApps.stream().map(InstalledApp::appId).collect(java.util.stream.Collectors.joining(",")), "", "failed", 0, userMessage(exception));
            activityLogService.error("backup", cleanSource(source) + "_full_backup", "Full backup failed", userMessage(exception), null, exception);
            return new BackupRunResult("__full__", "All apps", "failed", point.message(), point, Instant.now());
        }
    }

    public RestorePlan restorePlan(long restorePointId, String targetAppId) {
        RestorePoint point = backupRepository.findById(restorePointId);
        List<InstalledApp> affected = affectedApps(point, targetAppId);
        List<String> warnings = new ArrayList<>();
        List<String> dryRunDetails = new ArrayList<>();
        if (!"completed".equals(point.status())) {
            warnings.add("This restore point did not complete successfully.");
        }
        if (affected.isEmpty()) {
            warnings.add("No currently installed app matches this restore point.");
        }
        warnings.add("Current app data will be replaced. Project OS creates a safety backup before restoring.");
        for (InstalledApp app : affected) {
            BackupContract contract = backupContract(app);
            dryRunDetails.add(app.appName() + ": " + contract.label() + ". " + contract.summary());
            if (contract.reviewRequired()) {
                warnings.add(app.appName() + " uses " + contract.label().toLowerCase() + ". Project OS will restore managed files, but database/application consistency should be reviewed after restore.");
            }
        }
        if ("failed".equals(point.verificationStatus())) {
            warnings.add("Project OS could not verify this restore point: " + point.verificationMessage());
        } else if (!"verified".equals(point.verificationStatus())) {
            warnings.add("This restore point has not been verified yet.");
        }
        RestoreSimulationResult simulation = simulateRestore(point, affected);
        if ("failed".equals(simulation.status())) {
            warnings.add(simulation.message());
        } else if ("warning".equals(simulation.status())) {
            warnings.add("Restore simulation needs review: " + simulation.message());
        }
        List<String> steps = List.of(
                "Stop affected app services",
                "Create a safety backup of current app data",
                "Replace current data from the selected restore point",
                "Start affected app services again",
                "Record restore activity");
        String scope = "full".equals(point.scope()) && targetAppId == null ? "full" : "app";
        return new RestorePlan(
                point.id(),
                scope,
                point.source(),
                targetAppId,
                scope.equals("full") ? "Restore full backup" : "Restore app backup",
                restoreSummary(point, affected, targetAppId),
                affected.stream().map(InstalledApp::appName).toList(),
                warnings,
                steps,
                dryRunDetails,
                point.verificationStatus(),
                point.verificationMessage(),
                simulation,
                restoreConfidence(point, affected),
                "completed".equals(point.status()) && !affected.isEmpty() && Files.isRegularFile(Path.of(point.path())) && !"failed".equals(simulation.status()),
                Instant.now());
    }

    public BackupVerificationResult verify(long restorePointId) {
        return verifyRestorePoint(backupRepository.findById(restorePointId)).result();
    }

    public RestoreResult restore(long restorePointId, String targetAppId) {
        RestorePlan plan = restorePlan(restorePointId, targetAppId);
        if (!plan.executable()) {
            throw new InstallationException("This restore point cannot be restored. Review the restore plan for details.");
        }
        RestorePoint point = backupRepository.findById(restorePointId);
        List<InstalledApp> apps = affectedApps(point, targetAppId);
        List<String> logs = new ArrayList<>();
        for (InstalledApp app : apps) {
            restoreApp(point, app, logs);
        }
        String message = plan.scope().equals("full")
                ? "Full restore completed for " + apps.size() + " app(s)."
                : "Restore completed for " + apps.getFirst().appName() + ".";
        activityLogService.success("backup", "restore_completed", message, String.join(", ", apps.stream().map(InstalledApp::appName).toList()), null);
        return new RestoreResult(point.id(), "completed", message, apps.stream().map(InstalledApp::appId).toList(), logs, Instant.now());
    }

    private BackupRunResult runAppBackup(String appId, String backupSource) {
        InstalledApp app = installedAppRepository.findById(appId)
                .orElseThrow(() -> new InstallationException("App is not installed: " + appId));
        Path source = Path.of(app.runtimePath()).toAbsolutePath().normalize();
        BackupPolicy policy = installedAppRepository.settingsFor(appId)
                .map(InstallSettings::backup)
                .orElse(BackupPolicy.defaults());
        if (!policy.enabled()) {
            RestorePoint point = backupRepository.record(app.appId(), app.appName(), "", "failed", 0, "Backups are turned off for this app.");
            return new BackupRunResult(app.appId(), app.appName(), "failed", point.message(), point, Instant.now());
        }
        try {
            validateBackup(source);
            Files.createDirectories(backupRoot().resolve(app.appId()));
            Path destination = backupRoot().resolve(app.appId()).resolve(app.appId() + "-" + BACKUP_NAME_FORMAT.format(Instant.now()) + ".zip");
            long size = fileOpsService.createSafetyArchive(app.appId(), destination);
            RestorePoint point = backupRepository.record(app.appId(), app.appName(), "app", cleanSource(backupSource), app.appId(), destination.toString(), "completed", size, "Backup completed.");
            point = verifyRestorePoint(point).restorePoint();
            activityLogService.success("backup", cleanSource(backupSource) + "_app_backup", "Backup completed", app.appName() + " backup is ready.", app.appId());
            installedAppRepository.recordEvent(app.appId(), "backup_completed", "Backup completed.");
            return new BackupRunResult(app.appId(), app.appName(), "completed", "Backup completed.", point, Instant.now());
        } catch (RuntimeException | IOException exception) {
            RestorePoint point = backupRepository.record(app.appId(), app.appName(), "app", cleanSource(backupSource), app.appId(), "", "failed", 0, userMessage(exception));
            activityLogService.error("backup", cleanSource(backupSource) + "_app_backup", "Backup failed", userMessage(exception), app.appId(), exception);
            installedAppRepository.recordEvent(app.appId(), "backup_failed", userMessage(exception));
            return new BackupRunResult(app.appId(), app.appName(), "failed", userMessage(exception), point, Instant.now());
        }
    }

    private void validateFullBackup(List<InstalledApp> apps) throws IOException {
        Files.createDirectories(backupRoot());
        long estimatedSize = apps.stream().mapToLong(app -> fileOperations.directorySize(Path.of(app.runtimePath()))).sum();
        FileStore store = Files.getFileStore(backupRoot());
        if (store.getUsableSpace() < estimatedSize + BACKUP_FREE_SPACE_BUFFER_BYTES) {
            throw new InstallationException("Not enough free space to create a full backup.");
        }
        for (InstalledApp app : apps) {
            Path source = Path.of(app.runtimePath()).toAbsolutePath().normalize();
            if (!Files.isDirectory(source)) {
                throw new InstallationException(app.appName() + " data folder is missing.");
            }
            if (!Files.isReadable(source)) {
                throw new InstallationException("Project OS cannot read " + app.appName() + " data folder.");
            }
        }
    }

    private long zipApps(List<InstalledApp> apps, Path destination) throws IOException {
        return fileOpsService.createFullArchive(apps.stream().map(InstalledApp::appId).toList(), destination);
    }

    private List<InstalledApp> affectedApps(RestorePoint point, String targetAppId) {
        Map<String, InstalledApp> installed = managedInstalledApps().stream()
                .collect(java.util.stream.Collectors.toMap(InstalledApp::appId, app -> app));
        if (targetAppId != null && !targetAppId.isBlank()) {
            InstalledApp app = installed.get(targetAppId);
            return app == null ? List.of() : List.of(app);
        }
        if ("full".equals(point.scope())) {
            return java.util.Arrays.stream(point.includedAppIds().split(","))
                    .map(String::trim)
                    .filter(id -> !id.isBlank())
                    .map(installed::get)
                    .filter(java.util.Objects::nonNull)
                    .toList();
        }
        InstalledApp app = installed.get(point.appId());
        return app == null ? List.of() : List.of(app);
    }

    private String restoreSummary(RestorePoint point, List<InstalledApp> affected, String targetAppId) {
        if ("full".equals(point.scope()) && targetAppId == null) {
            return "Restore " + affected.size() + " app(s) from a " + point.source() + " full backup created " + point.createdAt() + ".";
        }
        String appName = affected.isEmpty() ? "selected app" : affected.getFirst().appName();
        return "Restore " + appName + " from a " + point.source() + " backup created " + point.createdAt() + ".";
    }

    private List<InstalledApp> managedInstalledApps() {
        List<String> managedAppIds = appInstanceViewProvider.list().stream()
                .map(AppInstanceView::catalogAppId)
                .filter(id -> id != null && !id.isBlank())
                .distinct()
                .toList();
        return managedAppIds.stream()
                .map(installedAppRepository::findById)
                .flatMap(Optional::stream)
                .toList();
    }

    private void restoreApp(RestorePoint point, InstalledApp app, List<String> logs) {
        Path destination = Path.of(app.runtimePath()).toAbsolutePath().normalize();
        try {
            logs.add("Stopping " + app.appName() + ".");
            AppActionResult stop = appLifecycleService.stop(app.appId());
            logs.add(stop.message());
        } catch (RuntimeException exception) {
            logs.add("Project OS could not stop " + app.appName() + ": " + userMessage(exception));
        }
        try {
            if (Files.exists(destination) && fileOperations.directorySize(destination) > 0) {
                Files.createDirectories(backupRoot().resolve("pre-restore"));
                Path safety = backupRoot().resolve("pre-restore").resolve(app.appId() + "-pre-restore-" + BACKUP_NAME_FORMAT.format(Instant.now()) + ".zip");
                long size = fileOpsService.createSafetyArchive(app.appId(), safety);
                backupRepository.record(app.appId(), app.appName(), "app", "pre_restore", app.appId(), safety.toString(), "completed", size, "Safety backup created before restore.");
                logs.add("Created safety backup for " + app.appName() + ".");
            }
            fileOpsService.restoreAppData(Path.of(point.path()), point.scope(), app.appId());
            installedAppRepository.recordEvent(app.appId(), "restore_completed", "Restored data from restore point #" + point.id() + ".");
            activityLogService.success("backup", "restore_app", "Restored " + app.appName(), "Restored data from restore point #" + point.id() + ".", app.appId());
            logs.add("Restored " + app.appName() + ".");
        } catch (RuntimeException | IOException exception) {
            installedAppRepository.recordEvent(app.appId(), "restore_failed", userMessage(exception));
            activityLogService.error("backup", "restore_app", "Restore failed for " + app.appName(), userMessage(exception), app.appId(), exception);
            throw new InstallationException("Restore failed for " + app.appName() + ": " + userMessage(exception), exception);
        } finally {
            try {
                logs.add("Starting " + app.appName() + ".");
                AppActionResult start = appLifecycleService.start(app.appId());
                logs.add(start.message());
            } catch (RuntimeException exception) {
                logs.add("Project OS could not start " + app.appName() + ": " + userMessage(exception));
            }
        }
    }

    private void unzipRestore(RestorePoint point, InstalledApp app, Path destination) throws IOException {
        Path zipPath = Path.of(point.path()).toAbsolutePath().normalize();
        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(zipPath))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                String name = entry.getName();
                if ("full".equals(point.scope())) {
                    String prefix = app.appId() + "/";
                    if (!name.startsWith(prefix)) {
                        continue;
                    }
                    name = name.substring(prefix.length());
                }
                if (name.isBlank()) {
                    continue;
                }
                Path target = destination.resolve(name).normalize();
                if (!target.startsWith(destination)) {
                    throw new InstallationException("Restore point contains an unsafe file path.");
                }
                Files.createDirectories(target.getParent());
                Files.copy(zip, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                zip.closeEntry();
            }
        }
    }

    private RestoreSimulationResult simulateRestore(RestorePoint point, List<InstalledApp> affected) {
        if (!"completed".equals(point.status())) {
            return new RestoreSimulationResult("failed", "Only completed restore points can be simulated.", List.of("Backup status is " + point.status() + "."), Instant.now());
        }
        if (affected.isEmpty()) {
            return new RestoreSimulationResult("failed", "No installed app matches this restore point.", List.of("Project OS could not find a current app for this restore point."), Instant.now());
        }
        Path zipPath = Path.of(point.path()).toAbsolutePath().normalize();
        if (!Files.isRegularFile(zipPath)) {
            return new RestoreSimulationResult("failed", "Backup file is missing, so Project OS cannot simulate restore.", List.of(zipPath.toString()), Instant.now());
        }

        List<String> details = new ArrayList<>();
        boolean reviewRequired = false;
        boolean failed = false;
        Path simulationRoot = backupRoot().resolve("simulations").resolve("restore-" + point.id() + "-" + BACKUP_NAME_FORMAT.format(Instant.now())).normalize();
        try {
            Files.createDirectories(simulationRoot);
            for (InstalledApp app : affected) {
                BackupContract contract = backupContract(app);
                if (contract.reviewRequired()) {
                    reviewRequired = true;
                    details.add(app.appName() + ": simulation skipped for " + contract.label().toLowerCase() + ". " + contract.summary());
                    continue;
                }
                SimulationStats stats = extractAppForSimulation(point, app, simulationRoot.resolve(app.appId()).normalize());
                if (stats.files() == 0 || stats.bytes() == 0) {
                    failed = true;
                    details.add(app.appName() + ": no restorable files were found in the archive.");
                } else {
                    details.add(app.appName() + ": simulated " + stats.files() + " file(s), " + stats.bytes() + " byte(s), without touching live data.");
                }
            }
        } catch (RuntimeException | IOException exception) {
            failed = true;
            details.add("Simulation failed: " + userMessage(exception));
        } finally {
            try {
                deleteContents(simulationRoot);
                Files.deleteIfExists(simulationRoot);
            } catch (IOException ignored) {
                details.add("Temporary simulation files could not be fully removed. They are under " + simulationRoot + ".");
            }
        }

        if (failed) {
            return new RestoreSimulationResult("failed", "Project OS could not prove this restore point can be safely extracted.", details, Instant.now());
        }
        if (reviewRequired) {
            return new RestoreSimulationResult("warning", "File restore simulation passed where supported, but at least one app needs a stronger backup contract.", details, Instant.now());
        }
        return new RestoreSimulationResult("passed", "Project OS simulated this restore into a temporary folder and found restorable files.", details, Instant.now());
    }

    private SimulationStats extractAppForSimulation(RestorePoint point, InstalledApp app, Path destination) throws IOException {
        Path zipPath = Path.of(point.path()).toAbsolutePath().normalize();
        Files.createDirectories(destination);
        long files = 0;
        long bytes = 0;
        byte[] buffer = new byte[8192];
        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(zipPath))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    zip.closeEntry();
                    continue;
                }
                String name = entry.getName();
                if ("full".equals(point.scope())) {
                    String prefix = app.appId() + "/";
                    if (!name.startsWith(prefix)) {
                        zip.closeEntry();
                        continue;
                    }
                    name = name.substring(prefix.length());
                }
                if (name.isBlank()) {
                    zip.closeEntry();
                    continue;
                }
                Path target = destination.resolve(name).normalize();
                if (!target.startsWith(destination)) {
                    throw new InstallationException("Restore point contains an unsafe file path.");
                }
                Files.createDirectories(target.getParent());
                try (var output = Files.newOutputStream(target)) {
                    int read;
                    while ((read = zip.read(buffer)) >= 0) {
                        output.write(buffer, 0, read);
                        bytes += read;
                    }
                }
                files++;
                zip.closeEntry();
            }
        }
        return new SimulationStats(files, bytes);
    }

    private void deleteContents(Path directory) throws IOException {
        if (!Files.exists(directory)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(directory)) {
            List<Path> sorted = paths.sorted(Comparator.reverseOrder()).toList();
            for (Path path : sorted) {
                if (!path.equals(directory)) {
                    Files.deleteIfExists(path);
                }
            }
        }
    }

    private AppBackupStatus appStatus(InstalledApp app, Map<String, ApplicationManifest> manifestsById) {
        Optional<InstallSettings> settings = installedAppRepository.settingsFor(app.appId());
        BackupPolicy policy = settings.map(InstallSettings::backup).orElse(BackupPolicy.defaults());
        List<RestorePoint> restorePoints = backupRepository.forApp(app.appId(), 5);
        RestorePoint latest = restorePoints.stream().findFirst().orElse(null);
        long dataSize = fileOperations.directorySize(Path.of(app.runtimePath()));
        BackupContract contract = backupContract(app, manifestsById.get(app.appId()));
        String status = appBackupStatus(policy, latest, contract);
        return new AppBackupStatus(
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

    private String appBackupStatus(BackupPolicy policy, RestorePoint latest, BackupContract contract) {
        if (!policy.enabled()) {
            return "unprotected";
        }
        if (contract.reviewRequired()) {
            return "needs_backup_review";
        }
        if (latest == null) {
            return "not_backed_up";
        }
        if ("failed".equals(latest.status())) {
            return "failed";
        }
        if ("completed".equals(latest.status())) {
            return "protected";
        }
        return "not_backed_up";
    }

    private String statusMessage(BackupPolicy policy, RestorePoint latest, BackupContract contract) {
        if (!policy.enabled()) {
            return "Backups are off.";
        }
        if (contract.reviewRequired()) {
            return "Needs backup review: " + contract.summary();
        }
        if (latest == null) {
            return "No restore point yet.";
        }
        if ("failed".equals(latest.status())) {
            return latest.message();
        }
        if ("completed".equals(latest.status())) {
            return "Protected by restore point.";
        }
        return "No completed restore point yet.";
    }

    private BackupContract backupContract(InstalledApp app) {
        return backupContract(app, catalogService.findById(app.appId()).orElse(null));
    }

    private BackupContract backupContract(InstalledApp app, ApplicationManifest appManifest) {
        if (appManifest == null) {
            return new BackupContract(
                    "unknown",
                    "Unknown backup contract",
                    "needs_review",
                    true,
                    "Project OS cannot find this app's catalog backup contract.",
                    List.of("Catalog manifest was not found for " + app.appId() + "."));
        }
        List<String> backupPaths = appManifest.runtime().backupPaths();
        boolean multiService = appManifest.runtime().multiService();
        boolean hasPostgres = backupPaths.stream().anyMatch(path -> path.toLowerCase().contains("postgres"));
        boolean hasSqlite = appManifest.includes().stream().anyMatch(item -> item.toLowerCase().contains("sqlite"))
                || backupPaths.stream().anyMatch(path -> path.toLowerCase().contains("sqlite") || path.equalsIgnoreCase("data"));
        if (backupPaths.isEmpty()) {
            return new BackupContract(
                    "none",
                    "No declared backup paths",
                    "weak",
                    true,
                    "The manifest does not declare managed backup paths yet.",
                    List.of("Project OS cannot prove what data should be included."));
        }
        if (hasPostgres) {
            return new BackupContract(
                    "postgres",
                    "Database-aware review",
                    "needs_review",
                    true,
                    "This app stores data in PostgreSQL. File snapshots exist, but a database dump/restore contract is still needed.",
                    List.of("Declared paths: " + String.join(", ", backupPaths), "Restore will replace managed folders but does not yet run a database dump/import."));
        }
        if (multiService) {
            return new BackupContract(
                    "multi-service",
                    "Multi-service review",
                    "needs_review",
                    true,
                    "This app uses multiple containers. Project OS needs a stronger app-specific backup contract before calling it fully protected.",
                    List.of("Declared paths: " + String.join(", ", backupPaths), "Services: " + appManifest.runtime().services().size()));
        }
        if (hasSqlite) {
            return new BackupContract(
                    "sqlite",
                    "SQLite/file backup",
                    "standard",
                    false,
                    "Project OS backs up the declared managed data folder. This is suitable for simple apps using local files or SQLite.",
                    List.of("Declared paths: " + String.join(", ", backupPaths)));
        }
        return new BackupContract(
                "file-only",
                "File backup",
                "standard",
                false,
                "Project OS backs up the declared managed files for this app.",
                List.of("Declared paths: " + String.join(", ", backupPaths)));
    }

    private String nextRunLabel(ProjectSettings settings) {
        if (!settings.automaticBackupsEnabled()) {
            return "Automatic backups are off";
        }
        String next = nextRoutineRun(settings, null);
        return next.isBlank() ? "Next " + settings.backupFrequency() + " window near " + settings.backupTime() : "Next routine backup: " + next;
    }

    private String schedulerHealth(ProjectSettings settings, RestorePoint lastRoutine) {
        if (!settings.automaticBackupsEnabled()) {
            return "off";
        }
        if (lastRoutine != null && "failed".equals(lastRoutine.status())) {
            return "warning";
        }
        return "healthy";
    }

    private String schedulerMessage(ProjectSettings settings, RestorePoint lastRoutine) {
        if (!settings.automaticBackupsEnabled()) {
            return "Automatic backups are turned off in Settings.";
        }
        if (lastRoutine != null && "failed".equals(lastRoutine.status())) {
            return "The latest routine backup failed: " + lastRoutine.message();
        }
        return "Routine backups are scheduled in the background. Project OS records these runs separately from manual checkpoints.";
    }

    private String nextRoutineRun(ProjectSettings settings, RestorePoint lastRoutine) {
        if (!settings.automaticBackupsEnabled()) {
            return "";
        }
        LocalTime backupTime = parseBackupTime(settings.backupTime());
        LocalDate startDate = LocalDate.now(ZoneOffset.UTC);
        if (lastRoutine != null) {
            startDate = LocalDateTime.ofInstant(lastRoutine.createdAt(), ZoneOffset.UTC).toLocalDate();
        }
        LocalDate nextDate = switch (settings.backupFrequency()) {
            case "hourly" -> LocalDate.now(ZoneOffset.UTC);
            case "weekly" -> startDate.plusWeeks(1);
            default -> startDate.plusDays(1);
        };
        LocalDateTime candidate = LocalDateTime.of(nextDate, backupTime);
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        while (!candidate.isAfter(now)) {
            candidate = switch (settings.backupFrequency()) {
                case "hourly" -> candidate.plusHours(1);
                case "weekly" -> candidate.plusWeeks(1);
                default -> candidate.plusDays(1);
            };
        }
        return candidate.toInstant(ZoneOffset.UTC).toString();
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

    private String nextBackup(BackupPolicy policy) {
        if (!policy.enabled()) {
            return "Not scheduled";
        }
        return "Next " + policy.frequency() + " window";
    }

    private void validateBackup(Path source) throws IOException {
        if (!Files.isDirectory(source)) {
            throw new InstallationException("App data folder is missing.");
        }
        if (!Files.isReadable(source)) {
            throw new InstallationException("Project OS cannot read the app data folder.");
        }
        Files.createDirectories(backupRoot());
        FileStore store = Files.getFileStore(backupRoot());
        long estimatedSize = fileOperations.directorySize(source);
        if (store.getUsableSpace() < estimatedSize + BACKUP_FREE_SPACE_BUFFER_BYTES) {
            throw new InstallationException("Not enough free space to create this backup.");
        }
    }

    private VerificationUpdate verifyRestorePoint(RestorePoint point) {
        if (!"completed".equals(point.status())) {
            RestorePoint updated = backupRepository.updateVerification(point.id(), "failed", "Only completed backups can be verified.", "", "low");
            return new VerificationUpdate(updated, result(updated));
        }
        try {
            Path path = Path.of(point.path());
            if (!Files.isRegularFile(path)) {
                RestorePoint updated = backupRepository.updateVerification(point.id(), "failed", "Backup file is missing.", "", "low");
                return new VerificationUpdate(updated, result(updated));
            }
            ZipSummary summary = inspectZip(path);
            if (summary.entries() == 0 || summary.bytes() <= 0) {
                RestorePoint updated = backupRepository.updateVerification(point.id(), "failed", "Backup archive is empty.", "", "low");
                return new VerificationUpdate(updated, result(updated));
            }
            String checksum = checksum(path);
            RestorePoint updated = backupRepository.updateVerification(
                    point.id(),
                    "verified",
                    "Verified " + summary.entries() + " file(s) and " + summary.bytes() + " byte(s) inside the archive.",
                    checksum,
                    confidenceFor(point));
            activityLogService.success("backup", "backup_verified", "Backup verified", updated.appName() + " restore point is readable.", null);
            return new VerificationUpdate(updated, result(updated));
        } catch (RuntimeException | IOException exception) {
            RestorePoint updated = backupRepository.updateVerification(point.id(), "failed", userMessage(exception), "", "low");
            RuntimeException logged = exception instanceof RuntimeException runtimeException ? runtimeException : new InstallationException(userMessage(exception), exception);
            activityLogService.error("backup", "backup_verification_failed", "Backup verification failed", userMessage(exception), point.appId(), logged);
            return new VerificationUpdate(updated, result(updated));
        }
    }

    private BackupVerificationResult result(RestorePoint point) {
        return new BackupVerificationResult(point.id(), point.verificationStatus(), point.verificationMessage(), point.checksumSha256(), point.restoreConfidence(), point.verifiedAt());
    }

    private String restoreConfidence(RestorePoint point, List<InstalledApp> affected) {
        if ("failed".equals(point.verificationStatus())) {
            return "Low";
        }
        if (!"verified".equals(point.verificationStatus())) {
            return "Unknown";
        }
        boolean reviewRequired = affected.stream().map(this::backupContract).anyMatch(BackupContract::reviewRequired);
        return reviewRequired ? "Medium" : "High";
    }

    private String confidenceFor(RestorePoint point) {
        if ("full".equals(point.scope()) && point.includedAppIds() != null && point.includedAppIds().contains(",")) {
            boolean reviewRequired = java.util.Arrays.stream(point.includedAppIds().split(","))
                    .map(String::trim)
                    .filter(value -> !value.isBlank())
                    .map(installedAppRepository::findById)
                    .flatMap(Optional::stream)
                    .map(this::backupContract)
                    .anyMatch(BackupContract::reviewRequired);
            return reviewRequired ? "medium" : "high";
        }
        return installedAppRepository.findById(point.appId())
                .map(this::backupContract)
                .filter(BackupContract::reviewRequired)
                .isPresent() ? "medium" : "high";
    }

    private ZipSummary inspectZip(Path path) throws IOException {
        long entries = 0;
        long bytes = 0;
        byte[] buffer = new byte[8192];
        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(path))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (!entry.isDirectory()) {
                    entries++;
                    int read;
                    while ((read = zip.read(buffer)) >= 0) {
                        bytes += read;
                    }
                }
                zip.closeEntry();
            }
        }
        return new ZipSummary(entries, bytes);
    }

    private String checksum(Path path) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (DigestInputStream input = new DigestInputStream(Files.newInputStream(path), digest)) {
                input.transferTo(java.io.OutputStream.nullOutputStream());
            }
            StringBuilder builder = new StringBuilder();
            for (byte value : digest.digest()) {
                builder.append(String.format("%02x", value));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new InstallationException("This Java runtime cannot calculate SHA-256 checksums.", exception);
        }
    }

    private record ZipSummary(long entries, long bytes) {
    }

    private record SimulationStats(long files, long bytes) {
    }

    private record VerificationUpdate(RestorePoint restorePoint, BackupVerificationResult result) {
    }

    private String status(List<AppBackupStatus> apps, int failedBackups) {
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

    private Path backupRoot() {
        return settingsRepository.backupDestination(runtimeLayout.runtimeRoot().resolve("backups"));
    }

    private String userMessage(Exception exception) {
        return exception.getMessage() == null || exception.getMessage().isBlank()
                ? "Backup failed."
                : exception.getMessage();
    }

    private String cleanSource(String source) {
        if (source == null || source.isBlank()) {
            return "manual";
        }
        String normalized = source.trim().toLowerCase();
        return switch (normalized) {
            case "automatic", "pre_restore" -> normalized;
            default -> "manual";
        };
    }
}

package com.autarkos.marketplace.install;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.backups.BackupRepository;
import com.autarkos.backups.RestorePoints;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.network.tailscale.TailscaleServeResult;
import com.autarkos.network.tailscale.TailscaleService;

class AppUninstallService {

    private static final DateTimeFormatter SAFETY_CHECKPOINT_NAME_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);

    private final InstalledAppRepository repository;
    private final DockerComposeExecutor composeExecutor;
    private final RuntimeLayout runtimeLayout;
    private final BackupRepository backupRepository;
    private final TailscaleService tailscaleService;
    private final AppRuntimeStatusResolver runtimeStatusResolver;
    private final ActivityLogService activityLogService;

    AppUninstallService(
            InstalledAppRepository repository,
            DockerComposeExecutor composeExecutor,
            RuntimeLayout runtimeLayout,
            BackupRepository backupRepository,
            TailscaleService tailscaleService,
            AppRuntimeStatusResolver runtimeStatusResolver,
            ActivityLogService activityLogService) {
        this.repository = repository;
        this.composeExecutor = composeExecutor;
        this.runtimeLayout = runtimeLayout;
        this.backupRepository = backupRepository;
        this.tailscaleService = tailscaleService;
        this.runtimeStatusResolver = runtimeStatusResolver;
        this.activityLogService = activityLogService;
    }

    UninstallPlan uninstallPlan(InstalledApp app) {
        boolean checkpointPlanned = hasCheckpointableData(app);
        String checkpointMessage = checkpointPlanned
                ? "Autark-OS will save a safety checkpoint before removing containers. Your app data is still kept on disk."
                : "Autark-OS did not find app data to checkpoint. The remove step will still keep the app folder if it exists.";
        return new UninstallPlan(
                app.appId(),
                app.appName(),
                "Autark-OS can remove the running app while keeping your data on disk.",
                checkpointPlanned,
                checkpointMessage,
                List.of("Create a safety checkpoint when app data is present", "Stop the app containers", "Remove the Compose project", "Hide the app from the managed Applications list"),
                List.of("Application data in " + app.runtimePath(), "Backups and files created outside Docker", "Historical activity events"),
                List.of("Confirm you understand that containers will be removed", "Delete data manually later if you no longer need it"));
    }

    AppActionResult uninstall(InstalledApp app, InstallSettings settings, Path composeFile) {
        List<String> logs = new java.util.ArrayList<>();
        SafetyCheckpointResult checkpoint = createPreUninstallCheckpoint(app);
        logs.addAll(checkpoint.logs());
        if (settings.tailscaleEnabled() || settings.privateAccessUrl() != null) {
            TailscaleServeResult disableResult = disablePrivateAccessMapping(app, settings);
            logs.addAll(disableResult.output());
        }
        DockerComposeResult result = composeExecutor.down(composeFile, app.composeProject());
        logs.addAll(result.output());
        if (result.successful()) {
            repository.recordEvent(app.appId(), "uninstalled", "Removed containers for " + app.appName() + "; data was kept on disk.");
            activitySuccess("uninstalled", "Uninstalled " + app.appName(), "Removed containers and kept app data on disk.", app.appId());
            repository.delete(app.appId());
            return new AppActionResult(app.appId(), "uninstall", "removed", app.appName() + " was removed from Autark-OS. Data was kept on disk.", null, logs, Instant.now());
        }
        repository.recordEvent(app.appId(), "uninstall_failed", String.join("\n", result.output()));
        activityWarning("uninstall_failed", "Uninstall failed for " + app.appName(), failureReason(result.output()), app.appId());
        throw new InstallationException("Could not uninstall " + app.appName() + ". Check the recent activity for details.");
    }

    private TailscaleServeResult disablePrivateAccessMapping(InstalledApp app, InstallSettings settings) {
        Integer port = runtimeStatusResolver.portFromUrl(settings.privateAccessUrl());
        if (port == null) {
            port = settings.expectedLocalPort() == null ? runtimeStatusResolver.portFromUrl(firstPresent(settings.accessUrl(), app.accessUrl())) : settings.expectedLocalPort();
        }
        if (port == null) {
            return new TailscaleServeResult(true, settings.privateAccessUrl(), "No private HTTPS port was stored for this app.", List.of("No private HTTPS port was stored for this app."));
        }
        TailscaleServeResult result = tailscaleService.disableHttps(port);
        if (!result.configured()) {
            repository.recordEvent(app.appId(), "private_access_disable_failed", result.message());
            activityWarning("private_access_disable_failed", "Private link removal failed for " + app.appName(), result.message(), app.appId());
            throw new InstallationException(result.message());
        }
        return result;
    }

    private SafetyCheckpointResult createPreUninstallCheckpoint(InstalledApp app) {
        Path source = Path.of(app.runtimePath()).toAbsolutePath().normalize();
        if (!Files.isDirectory(source) || directorySize(source) == 0) {
            return new SafetyCheckpointResult(false, List.of("No app data found to checkpoint before uninstall."));
        }
        try {
            Path directory = backupRoot().resolve("pre-uninstall");
            Files.createDirectories(directory);
            Path destination = directory.resolve(app.appId() + "-pre-uninstall-" + SAFETY_CHECKPOINT_NAME_FORMAT.format(Instant.now()) + ".zip");
            long size = zipDirectory(source, destination);
            backupRepository.save(RestorePoints.create(app.appId(), app.appName(), "app", "pre_uninstall", app.appId(), destination.toString(), AutarkOsStates.RestorePointStatus.COMPLETED, size, "Safety checkpoint created before uninstall."));
            repository.recordEvent(app.appId(), "safety_checkpoint_created", "Saved a safety checkpoint before removing " + app.appName() + ".");
            activitySuccess("safety_checkpoint_created", "Saved safety checkpoint", "Autark-OS saved a checkpoint before removing " + app.appName() + ".", app.appId());
            return new SafetyCheckpointResult(true, List.of("Created safety checkpoint " + destination));
        } catch (IOException | RuntimeException exception) {
            String reason = exception.getMessage() == null || exception.getMessage().isBlank()
                    ? "No detailed reason was returned."
                    : exception.getMessage();
            String message = "Autark-OS could not create a safety checkpoint before uninstall: " + reason;
            repository.recordEvent(app.appId(), "safety_checkpoint_failed", message);
            activityWarning("safety_checkpoint_failed", "Safety checkpoint failed", message, app.appId());
            return new SafetyCheckpointResult(false, List.of(message));
        }
    }

    private Path backupRoot() {
        return runtimeLayout.runtimeRoot().resolve("backups").toAbsolutePath().normalize();
    }

    private boolean hasCheckpointableData(InstalledApp app) {
        Path source = Path.of(app.runtimePath()).toAbsolutePath().normalize();
        return Files.isDirectory(source) && directorySize(source) > 0;
    }

    private long zipDirectory(Path source, Path destination) throws IOException {
        AtomicLong writtenBytes = new AtomicLong();
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(destination))) {
            Files.walkFileTree(source, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    if (!attrs.isRegularFile() || !Files.isReadable(file)) {
                        return FileVisitResult.CONTINUE;
                    }
                    Path relative = source.relativize(file);
                    ZipEntry entry = new ZipEntry(relative.toString());
                    zip.putNextEntry(entry);
                    long copied = Files.copy(file, zip);
                    writtenBytes.addAndGet(copied);
                    zip.closeEntry();
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exception) {
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attrs) {
                    return Files.isReadable(directory) ? FileVisitResult.CONTINUE : FileVisitResult.SKIP_SUBTREE;
                }
            });
        }
        return Files.size(destination) > 0 ? Files.size(destination) : writtenBytes.get();
    }

    private long directorySize(Path path) {
        if (!Files.exists(path)) {
            return 0;
        }
        AtomicLong total = new AtomicLong();
        try {
            Files.walkFileTree(path, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    if (attrs.isRegularFile()) {
                        total.addAndGet(attrs.size());
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exception) {
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attrs) {
                    return Files.isReadable(directory) ? FileVisitResult.CONTINUE : FileVisitResult.SKIP_SUBTREE;
                }
            });
        } catch (IOException | SecurityException ignored) {
            return total.get();
        }
        return total.get();
    }

    private String failureReason(List<String> output) {
        String reason = output == null ? "" : String.join("\n", output).trim();
        return firstPresent(reason, "The operation failed without returning details.");
    }

    private String firstPresent(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private void activitySuccess(String action, String title, String message, String appId) {
        if (activityLogService != null) {
            activityLogService.success("applications", action, title, message, appId);
        }
    }

    private void activityWarning(String action, String title, String message, String appId) {
        if (activityLogService != null) {
            activityLogService.warning("applications", action, title, message, appId);
        }
    }

    private record SafetyCheckpointResult(boolean created, List<String> logs) {
    }
}

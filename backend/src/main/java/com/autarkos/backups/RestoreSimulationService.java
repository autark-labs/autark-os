package com.autarkos.backups;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.function.Supplier;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.install.InstalledApp;

class RestoreSimulationService {

    private static final DateTimeFormatter BACKUP_NAME_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);

    private final BackupContractService backupContractService;
    private final Supplier<Path> backupRoot;

    RestoreSimulationService(BackupContractService backupContractService, Supplier<Path> backupRoot) {
        this.backupContractService = backupContractService;
        this.backupRoot = backupRoot;
    }

    RestoreModels.RestoreSimulationResult simulateRestore(RestorePoint point, List<InstalledApp> affected) {
        if (!AutarkOsStates.RestorePointStatus.COMPLETED.equals(point.status())) {
            return new RestoreModels.RestoreSimulationResult(AutarkOsStates.RestoreSimulationStatus.FAILED, "Only completed restore points can be simulated.", List.of("Backup status is " + point.status() + "."), Instant.now());
        }
        if (affected.isEmpty()) {
            return new RestoreModels.RestoreSimulationResult(AutarkOsStates.RestoreSimulationStatus.FAILED, "No installed app matches this restore point.", List.of("Autark-OS could not find a current app for this restore point."), Instant.now());
        }
        Path zipPath = Path.of(point.path()).toAbsolutePath().normalize();
        if (!Files.isRegularFile(zipPath)) {
            return new RestoreModels.RestoreSimulationResult(AutarkOsStates.RestoreSimulationStatus.FAILED, "Backup file is missing, so Autark-OS cannot simulate restore.", List.of(zipPath.toString()), Instant.now());
        }

        List<String> details = new java.util.ArrayList<>();
        boolean reviewRequired = false;
        boolean failed = false;
        Path simulationRoot = backupRoot.get().resolve("simulations").resolve("restore-" + point.id() + "-" + BACKUP_NAME_FORMAT.format(Instant.now())).normalize();
        try {
            Files.createDirectories(simulationRoot);
            for (InstalledApp app : affected) {
                BackupModels.BackupContract contract = backupContractService.backupContract(app);
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
            return new RestoreModels.RestoreSimulationResult(AutarkOsStates.RestoreSimulationStatus.FAILED, "Autark-OS could not prove this restore point can be safely extracted.", details, Instant.now());
        }
        if (reviewRequired) {
            return new RestoreModels.RestoreSimulationResult(AutarkOsStates.RestoreSimulationStatus.WARNING, "File restore simulation passed where supported, but at least one app needs a stronger backup contract.", details, Instant.now());
        }
        return new RestoreModels.RestoreSimulationResult(AutarkOsStates.RestoreSimulationStatus.PASSED, "Autark-OS simulated this restore into a temporary folder and found restorable files.", details, Instant.now());
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

    private String userMessage(Exception exception) {
        return exception.getMessage() == null || exception.getMessage().isBlank()
                ? "Backup failed."
                : exception.getMessage();
    }

    private record SimulationStats(long files, long bytes) {
    }
}

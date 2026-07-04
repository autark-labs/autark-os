package com.autarkos.backups;

import java.io.IOException;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.function.Supplier;

import com.autarkos.fileops.AutarkOsFileOpsService;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.system.RuntimeFileOperations;

class BackupArchiveService {

    private static final long BACKUP_FREE_SPACE_BUFFER_BYTES = 512L * 1024L * 1024L;

    private final RuntimeFileOperations fileOperations;
    private final AutarkOsFileOpsService fileOpsService;
    private final Supplier<Path> backupRoot;

    BackupArchiveService(RuntimeFileOperations fileOperations, AutarkOsFileOpsService fileOpsService, Supplier<Path> backupRoot) {
        this.fileOperations = fileOperations;
        this.fileOpsService = fileOpsService;
        this.backupRoot = backupRoot;
    }

    void validateAppBackup(Path source) throws IOException {
        if (!Files.isDirectory(source)) {
            throw new InstallationException("App data folder is missing.");
        }
        if (!Files.isReadable(source)) {
            throw new InstallationException("Autark-OS cannot read the app data folder.");
        }
        Files.createDirectories(backupRoot.get());
        FileStore store = Files.getFileStore(backupRoot.get());
        long estimatedSize = fileOperations.directorySize(source);
        if (store.getUsableSpace() < estimatedSize + BACKUP_FREE_SPACE_BUFFER_BYTES) {
            throw new InstallationException("Not enough free space to create this backup.");
        }
    }

    void validateFullBackup(List<InstalledApp> apps) throws IOException {
        Files.createDirectories(backupRoot.get());
        long estimatedSize = apps.stream().mapToLong(app -> fileOperations.directorySize(Path.of(app.runtimePath()))).sum();
        FileStore store = Files.getFileStore(backupRoot.get());
        if (store.getUsableSpace() < estimatedSize + BACKUP_FREE_SPACE_BUFFER_BYTES) {
            throw new InstallationException("Not enough free space to create a full backup.");
        }
        for (InstalledApp app : apps) {
            Path source = Path.of(app.runtimePath()).toAbsolutePath().normalize();
            if (!Files.isDirectory(source)) {
                throw new InstallationException(app.appName() + " data folder is missing.");
            }
            if (!Files.isReadable(source)) {
                throw new InstallationException("Autark-OS cannot read " + app.appName() + " data folder.");
            }
        }
    }

    long createFullArchive(List<InstalledApp> apps, Path destination) throws IOException {
        return fileOpsService.createFullArchive(apps.stream().map(InstalledApp::appId).toList(), destination);
    }

    long createAppArchive(String appId, Path destination) throws IOException {
        return fileOpsService.createSafetyArchive(appId, destination);
    }

    long createSafetyArchive(String appId, Path destination) throws IOException {
        return fileOpsService.createSafetyArchive(appId, destination);
    }

    void restoreAppData(Path restorePoint, String scope, String appId) throws IOException {
        fileOpsService.restoreAppData(restorePoint, scope, appId);
    }
}

package com.autarkos.backups;

import java.io.IOException;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import java.util.function.Function;

import com.autarkos.fileops.AutarkOsFileOpsService;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.install.ManagedStorageContractService;
import com.autarkos.system.RuntimeFileOperations;

class BackupArchiveService {

    private static final long BACKUP_FREE_SPACE_BUFFER_BYTES = 512L * 1024L * 1024L;

    private final RuntimeFileOperations fileOperations;
    private final AutarkOsFileOpsService fileOpsService;
    private final Supplier<Path> backupRoot;
    private final Function<Path, Path> archiveRootResolver;

    BackupArchiveService(RuntimeFileOperations fileOperations, AutarkOsFileOpsService fileOpsService, Supplier<Path> backupRoot, Function<Path, Path> archiveRootResolver) {
        this.fileOperations = fileOperations;
        this.fileOpsService = fileOpsService;
        this.backupRoot = backupRoot;
        this.archiveRootResolver = archiveRootResolver;
    }

    void validateAppBackup(Map<String, Path> sources) throws IOException {
        validateSources(sources, "App data");
        Files.createDirectories(backupRoot.get());
        FileStore store = Files.getFileStore(backupRoot.get());
        long estimatedSize = sources.values().stream().mapToLong(fileOperations::directorySize).sum();
        if (store.getUsableSpace() < estimatedSize + BACKUP_FREE_SPACE_BUFFER_BYTES) {
            throw new InstallationException("Not enough free space to create this backup.");
        }
    }

    void validateFullBackup(List<ManagedStorageContractService.Contract> apps) throws IOException {
        Files.createDirectories(backupRoot.get());
        long estimatedSize = apps.stream().flatMap(app -> app.protectedPaths().values().stream()).mapToLong(fileOperations::directorySize).sum();
        FileStore store = Files.getFileStore(backupRoot.get());
        if (store.getUsableSpace() < estimatedSize + BACKUP_FREE_SPACE_BUFFER_BYTES) {
            throw new InstallationException("Not enough free space to create a full backup.");
        }
        apps.forEach(contract -> validateSources(contract.protectedPaths(), contract.app().appName() + " data"));
    }

    long createFullArchive(List<ManagedStorageContractService.Contract> apps, Path destination) throws IOException {
        Map<String, Map<String, Path>> paths = new java.util.LinkedHashMap<>();
        apps.forEach(contract -> paths.put(contract.app().appId(), contract.protectedPaths()));
        return fileOpsService.createManagedFullArchive(paths, destination, backupRoot.get());
    }

    long createArchive(String appId, Map<String, Path> paths, Path destination) throws IOException {
        return fileOpsService.createManagedArchive(appId, paths, destination, backupRoot.get());
    }

    void restoreAppData(Path restorePoint, String scope, String appId) throws IOException {
        fileOpsService.restoreAppData(restorePoint, scope, appId, archiveRootResolver.apply(restorePoint));
    }

    private void validateSources(Map<String, Path> sources, String label) {
        if (sources == null || sources.isEmpty()) {
            throw new InstallationException(label + " has no declared durable paths.");
        }
        sources.values().forEach(source -> {
            if (!Files.isDirectory(source)) {
                throw new InstallationException(label + " folder is missing: " + source.getFileName());
            }
            if (!Files.isReadable(source)) {
                throw new InstallationException("Autark-OS cannot read " + label.toLowerCase() + ".");
            }
        });
    }
}

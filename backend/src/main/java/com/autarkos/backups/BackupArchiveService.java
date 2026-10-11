package com.autarkos.backups;

import java.io.IOException;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import java.util.function.Function;
import java.util.UUID;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.fileops.AutarkOsFileOpsService;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.ManagedStorageContractService;
import com.autarkos.system.RuntimeFileOperations;

public class BackupArchiveService {

    private static final long BACKUP_FREE_SPACE_BUFFER_BYTES = 512L * 1024L * 1024L;

    private final RuntimeFileOperations fileOperations;
    private final AutarkOsFileOpsService fileOpsService;
    private final Supplier<Path> backupRoot;
    private final Function<Path, Path> archiveRootResolver;
    private final BackupRepository repository;
    private final BackupVerificationService verification;
    private final BackupContractService contracts;
    private final MarketplaceCatalogService catalog;

    public BackupArchiveService(RuntimeFileOperations fileOperations, AutarkOsFileOpsService fileOpsService,
            BackupDestinationService destination, BackupRepository repository, InstalledAppRepository installed,
            MarketplaceCatalogService catalog, ActivityLogService activity) {
        this.fileOperations = fileOperations;
        this.fileOpsService = fileOpsService;
        this.backupRoot = destination::activeRoot;
        this.archiveRootResolver = destination::approvedRootForArchive;
        this.repository = repository;
        this.catalog = catalog;
        this.contracts = new BackupContractService(catalog);
        this.verification = new BackupVerificationService(repository, installed, contracts, activity);
    }

    public void validateAppBackup(Map<String, Path> sources) throws IOException {
        validateSources(sources, "App data");
        Files.createDirectories(backupRoot.get());
        FileStore store = Files.getFileStore(backupRoot.get());
        long estimatedSize = sources.values().stream().mapToLong(fileOperations::directorySize).sum();
        if (store.getUsableSpace() < estimatedSize + BACKUP_FREE_SPACE_BUFFER_BYTES) {
            throw new InstallationException("Not enough free space to create this backup.");
        }
    }

    BackupVerificationService verification() {
        return verification;
    }

    public BackupModels.BackupContract contract(InstalledApp app) {
        return contracts.backupContract(app);
    }

    /** Caller must hold mutation exclusion and confirm quiescence before creating an archive. */
    public RestorePoint createCheckpoint(InstalledApp app, Map<String, Path> paths, String source) throws IOException {
        BackupModels.BackupContract contract = contract(app);
        if (contract.reviewRequired()) {
            throw new InstallationException("A verified safety checkpoint is unavailable for " + app.appName() + ": " + contract.summary());
        }
        validateAppBackup(paths);
        Path directory = backupRoot.get().resolve(source.replace('_', '-'));
        Files.createDirectories(directory);
        Path archive = directory.resolve(app.appId() + "-" + UUID.randomUUID() + ".zip");
        long size = createArchive(app.appId(), paths, archive);
        RestorePoint point = recordVerifiedArchive(app.appId(), app.appName(), "app", source, app.appId(), archive,
                size, "Safety checkpoint created and verified.", contract);
        if (!AutarkOsStates.RestorePointStatus.VERIFIED.equals(point.verificationStatus())) {
            throw new InstallationException("Autark-OS could not verify the safety checkpoint: " + point.verificationMessage());
        }
        return point;
    }

    RestorePoint recordVerifiedArchive(String appId, String appName, String scope, String source,
            String includedAppIds, Path archive, long size, String message, BackupModels.BackupContract contract) throws IOException {
        String baseline = verification.captureIntegrityBaseline(archive);
        String imageIdentity = java.util.Arrays.stream(includedAppIds.split(","))
                .map(String::trim).filter(id -> !id.isBlank())
                .map(id -> catalog.findById(id).map(manifest -> manifest.id() + " version " + manifest.version()
                        + " image " + manifest.runtime().image()).orElse(id + " (catalog identity unavailable)"))
                .collect(java.util.stream.Collectors.joining("; "));
        verification.writeArchiveManifest(archive, baseline, appId, appName, scope, source, includedAppIds, contract, imageIdentity);
        RestorePoint point = RestorePoints.toDomain(repository.save(RestorePoints.create(appId, appName, scope, source,
                includedAppIds, archive.toString(), AutarkOsStates.RestorePointStatus.COMPLETED, size, message,
                baseline, contract.strategy(), contract.version())));
        return verification.verifyRestorePoint(point).restorePoint();
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

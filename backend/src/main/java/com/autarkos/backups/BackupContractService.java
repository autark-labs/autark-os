package com.autarkos.backups;

import java.util.List;

import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.model.ApplicationManifest;

class BackupContractService {

    private final MarketplaceCatalogService catalogService;

    BackupContractService(MarketplaceCatalogService catalogService) {
        this.catalogService = catalogService;
    }

    BackupModels.BackupContract backupContract(InstalledApp app) {
        return backupContract(app, catalogService.findById(app.appId()).orElse(null));
    }

    BackupModels.BackupContract backupContract(InstalledApp app, ApplicationManifest appManifest) {
        if (appManifest == null) {
            return new BackupModels.BackupContract(
                    "review_required",
                    0,
                    "Unknown backup contract",
                    "needs_review",
                    true,
                    "Autark-OS cannot find this app's catalog backup contract.",
                    List.of("Catalog manifest was not found for " + app.appId() + "."));
        }
        List<String> backupPaths = appManifest.runtime().backupPaths();
        String declaredStrategy = appManifest.runtime().backupStrategy();
        int declaredVersion = appManifest.runtime().backupContractVersion();
        if (declaredStrategy == null || declaredStrategy.isBlank() || declaredVersion < 1) {
            return new BackupModels.BackupContract(
                    "review_required",
                    0,
                    "Backup contract needs review",
                    "needs_review",
                    true,
                    "This catalog item has not declared a versioned backup and restore contract yet.",
                    List.of("Autark-OS will keep existing restore points visible, but will not call this app protected or restore it automatically."));
        }
        if (backupPaths.isEmpty()) {
            return new BackupModels.BackupContract(
                    "review_required",
                    declaredVersion,
                    "No declared backup paths",
                    "weak",
                    true,
                    "The manifest does not declare managed backup paths yet.",
                    List.of("Autark-OS cannot prove what data should be included."));
        }
        return switch (declaredStrategy.trim().toLowerCase()) {
            case "cold_file" -> new BackupModels.BackupContract(
                    "cold_file", declaredVersion, "Stopped app file backup", "standard", false,
                    "Autark-OS stops this app, confirms it is stopped, then creates and verifies a managed-file restore point.",
                    List.of("Declared paths: " + String.join(", ", backupPaths), "The app is restarted after the archive is verified."));
            case "hot_file", "sqlite_aware", "database_dump_required" -> new BackupModels.BackupContract(
                    declaredStrategy.trim().toLowerCase(), declaredVersion, "Backup contract needs review", "needs_review", true,
                    "This app declares " + declaredStrategy.replace('_', ' ') + ", but this release does not yet run its required consistency hook.",
                    List.of("Declared paths: " + String.join(", ", backupPaths), "Autark-OS will not make an automatic protection or restore claim until the hook is implemented."));
            default -> new BackupModels.BackupContract(
                    "review_required", declaredVersion, "Backup contract needs review", "needs_review", true,
                    "This app declares an unsupported backup strategy: " + declaredStrategy + ".",
                    List.of("Declare cold_file, hot_file, sqlite_aware, or database_dump_required."));
        };
    }
}

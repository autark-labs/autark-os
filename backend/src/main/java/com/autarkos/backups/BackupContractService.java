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

    BackupContract backupContract(InstalledApp app) {
        return backupContract(app, catalogService.findById(app.appId()).orElse(null));
    }

    BackupContract backupContract(InstalledApp app, ApplicationManifest appManifest) {
        if (appManifest == null) {
            return new BackupContract(
                    "unknown",
                    "Unknown backup contract",
                    "needs_review",
                    true,
                    "Autark-OS cannot find this app's catalog backup contract.",
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
                    List.of("Autark-OS cannot prove what data should be included."));
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
                    "This app uses multiple containers. Autark-OS needs a stronger app-specific backup contract before calling it fully protected.",
                    List.of("Declared paths: " + String.join(", ", backupPaths), "Services: " + appManifest.runtime().services().size()));
        }
        if (hasSqlite) {
            return new BackupContract(
                    "sqlite",
                    "SQLite/file backup",
                    "standard",
                    false,
                    "Autark-OS backs up the declared managed data folder. This is suitable for simple apps using local files or SQLite.",
                    List.of("Declared paths: " + String.join(", ", backupPaths)));
        }
        return new BackupContract(
                "file-only",
                "File backup",
                "standard",
                false,
                "Autark-OS backs up the declared managed files for this app.",
                List.of("Declared paths: " + String.join(", ", backupPaths)));
    }
}

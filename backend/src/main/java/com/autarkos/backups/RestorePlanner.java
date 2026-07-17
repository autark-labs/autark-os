package com.autarkos.backups;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import java.util.function.Predicate;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstallationException;

class RestorePlanner {

    private final BackupRepository backupRepository;
    private final BackupContractService backupContractService;
    private final BackupVerificationService backupVerificationService;
    private final RestoreSimulationService restoreSimulationService;
    private final Supplier<List<InstalledApp>> managedInstalledApps;
    private final Predicate<Path> archiveAvailable;

    RestorePlanner(
            BackupRepository backupRepository,
            BackupContractService backupContractService,
            BackupVerificationService backupVerificationService,
            RestoreSimulationService restoreSimulationService,
            Supplier<List<InstalledApp>> managedInstalledApps,
            Predicate<Path> archiveAvailable) {
        this.backupRepository = backupRepository;
        this.backupContractService = backupContractService;
        this.backupVerificationService = backupVerificationService;
        this.restoreSimulationService = restoreSimulationService;
        this.managedInstalledApps = managedInstalledApps;
        this.archiveAvailable = archiveAvailable;
    }

    RestoreModels.RestorePlan restorePlan(long restorePointId, String targetAppId) {
        RestorePoint point = backupRepository.findById(restorePointId)
                .map(RestorePoints::toDomain)
                .orElseThrow(() -> new InstallationException("Restore point was not found."));
        List<InstalledApp> affected = affectedApps(point, targetAppId);
        List<String> warnings = new ArrayList<>();
        List<String> dryRunDetails = new ArrayList<>();
        if (!AutarkOsStates.RestorePointStatus.COMPLETED.equals(point.status())) {
            warnings.add("This restore point did not complete successfully.");
        }
        if (affected.isEmpty()) {
            warnings.add("No currently installed app matches this restore point.");
        }
        warnings.add("Current app data will be replaced. Autark-OS creates a safety backup before restoring.");
        for (InstalledApp app : affected) {
            BackupModels.BackupContract contract = backupContractService.backupContract(app);
            dryRunDetails.add(app.appName() + ": " + contract.label() + ". " + contract.summary());
            if (contract.reviewRequired()) {
                warnings.add(app.appName() + " uses " + contract.label().toLowerCase() + ". Autark-OS will restore managed files, but database/application consistency should be reviewed after restore.");
            }
        }
        if (AutarkOsStates.RestorePointStatus.FAILED.equals(point.verificationStatus())) {
            warnings.add("Autark-OS could not verify this restore point: " + point.verificationMessage());
        } else if (!AutarkOsStates.RestorePointStatus.VERIFIED.equals(point.verificationStatus())) {
            warnings.add("This restore point has not been verified yet.");
        }
        RestoreModels.RestoreSimulationResult simulation = restoreSimulationService.simulateRestore(point, affected);
        if (AutarkOsStates.RestoreSimulationStatus.FAILED.equals(simulation.status())) {
            warnings.add(simulation.message());
        } else if (AutarkOsStates.RestoreSimulationStatus.WARNING.equals(simulation.status())) {
            warnings.add("Restore simulation needs review: " + simulation.message());
        }
        List<String> steps = List.of(
                "Stop affected app services",
                "Create a safety backup of current app data",
                "Replace current data from the selected restore point",
                "Start affected app services again",
                "Record restore activity");
        String scope = "full".equals(point.scope()) && targetAppId == null ? "full" : "app";
        return new RestoreModels.RestorePlan(
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
                backupVerificationService.restoreConfidence(point, affected),
                AutarkOsStates.RestorePointStatus.COMPLETED.equals(point.status())
                        && !affected.isEmpty()
                        && archiveAvailable.test(Path.of(point.path()))
                        && !AutarkOsStates.RestoreSimulationStatus.FAILED.equals(simulation.status()),
                Instant.now());
    }

    List<InstalledApp> affectedApps(RestorePoint point, String targetAppId) {
        Map<String, InstalledApp> installed = managedInstalledApps.get().stream()
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
}

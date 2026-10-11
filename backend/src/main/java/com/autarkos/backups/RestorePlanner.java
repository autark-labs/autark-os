package com.autarkos.backups;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.function.Supplier;

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
    private final Function<InstalledApp, String> unavailableReason;
    private final Function<InstalledApp, List<String>> appIdentity;

    RestorePlanner(BackupRepository backupRepository, BackupContractService backupContractService,
            BackupVerificationService backupVerificationService, RestoreSimulationService restoreSimulationService,
            Supplier<List<InstalledApp>> managedInstalledApps, Predicate<Path> archiveAvailable,
            Function<InstalledApp, String> unavailableReason, Function<InstalledApp, List<String>> appIdentity) {
        this.backupRepository = backupRepository;
        this.backupContractService = backupContractService;
        this.backupVerificationService = backupVerificationService;
        this.restoreSimulationService = restoreSimulationService;
        this.managedInstalledApps = managedInstalledApps;
        this.archiveAvailable = archiveAvailable;
        this.unavailableReason = unavailableReason;
        this.appIdentity = appIdentity;
    }

    RestoreModels.RestorePlan restorePlan(long restorePointId, String targetAppId) {
        RestorePoint point = backupRepository.findById(restorePointId).map(RestorePoints::toDomain)
                .orElseThrow(() -> new InstallationException("Restore point was not found. Choose another archive."));
        String target = targetAppId == null || targetAppId.isBlank() ? null : targetAppId;
        var managed = managedInstalledApps.get().stream().collect(java.util.stream.Collectors.toMap(InstalledApp::appId, app -> app));
        List<String> includedIds = includedIds(point);
        List<String> blocked = new ArrayList<>();
        List<String> warnings = new ArrayList<>(List.of(
                "Current data for the selected apps will be replaced. Each app is stopped and receives a verified safety checkpoint before its data changes.",
                "Apps are restored one at a time and started after restoring. If an app fails, its safety checkpoint is used for recovery where possible and later apps are not attempted. Earlier successful restores are not undone."));
        List<String> details = new ArrayList<>();
        List<RestoreModels.RestorePlanApp> members = new ArrayList<>();
        List<InstalledApp> affected = new ArrayList<>();
        List<String> identity = new ArrayList<>(java.util.Arrays.asList("restore-review-v1", Long.toString(point.id()),
                point.path(), point.scope(), point.source(), point.createdAt().toString(), point.integrityBaselineSha256(),
                point.backupContractStrategy(), Integer.toString(point.backupContractVersion()), point.includedAppIds(), target));
        if (!AutarkOsStates.RestorePointStatus.COMPLETED.equals(point.status())) blocked.add("This restore point did not complete successfully.");
        if (!AutarkOsStates.RestorePointStatus.VERIFIED.equals(point.verificationStatus())) blocked.add("This restore point has not passed verification: " + point.verificationMessage());
        if (!archiveAvailable.test(Path.of(point.path()))) blocked.add("The archive's backup location is unavailable. Reconnect its drive before restoring.");
        if (target != null && !includedIds.contains(target)) blocked.add("The selected app is not included in this archive.");
        for (String id : includedIds) {
            var app = managed.get(id);
            String name = app == null ? (id.equals(point.appId()) ? point.appName() : id) : app.appName();
            boolean selected = target == null || target.equals(id);
            String reason = app == null ? "This app is not currently managed. Install or recover it explicitly before restoring its data."
                    : unavailableReason.apply(app);
            if (app != null && reason.isBlank() && !backupContractService.compatible(point, app)) {
                reason = "The current app does not match this archive's backup contract.";
            }
            String status = !selected ? "excluded" : app == null ? "missing" : reason.isBlank() ? "restorable" : "blocked";
            String message = !selected ? "Not selected for this restore." + (reason.isBlank() ? "" : " " + reason)
                    : reason.isBlank() ? "Current app data will be replaced from this archive." : reason;
            members.add(new RestoreModels.RestorePlanApp(id, name, status, message));
            identity.addAll(List.of(id, status, message));
            if (!selected) continue;
            if (!reason.isBlank()) {
                blocked.add(name + ": " + reason);
                continue;
            }
            var contract = backupContractService.backupContract(app);
            details.add(name + ": " + contract.label() + ". " + contract.summary());
            details.addAll(contract.details());
            try {
                identity.addAll(appIdentity.apply(app));
                affected.add(app);
            } catch (RuntimeException changed) {
                blocked.add(name + ": managed storage or ownership changed. Review this app before restoring.");
            }
        }
        if (affected.isEmpty()) blocked.add("No eligible managed app is selected for this restore.");
        if (blocked.isEmpty()) {
            var integrity = backupVerificationService.restoreIntegrity(point);
            if (!integrity.restorable()) blocked.add(integrity.message());
        }
        var simulation = blocked.isEmpty() ? restoreSimulationService.simulateRestore(point, affected)
                : new RestoreModels.RestoreSimulationResult("not_run", "Resolve the restore blockers before extraction can be checked.", List.of(), Instant.now());
        if (AutarkOsStates.RestoreSimulationStatus.FAILED.equals(simulation.status())) blocked.add(simulation.message());
        String scope = "full".equals(point.scope()) && target == null ? "full" : "app";
        String names = affected.stream().map(InstalledApp::appName).collect(java.util.stream.Collectors.joining(", "));
        String summary = blocked.isEmpty() ? "Restore " + names + " from archive #" + point.id() + " created " + point.createdAt() + "."
                : "Archive #" + point.id() + " cannot be restored with this selection. Review the listed apps and blockers.";
        String planId = digest(identity) + "." + UUID.randomUUID();
        String jobId = com.autarkos.jobs.AutarkOsJobService.onceJobId("review:" + reviewKey(point.id(), target, planId));
        return new RestoreModels.RestorePlan(point.id(), scope, point.source(), target,
                "full".equals(scope) ? "Restore full backup" : "Restore app backup", summary,
                affected.stream().map(InstalledApp::appName).toList(), List.copyOf(warnings),
                List.of("Stop and confirm each selected app is paused", "Create and verify its safety checkpoint",
                        "Validate and replace its data from the selected archive", "Start the app and check its health",
                        "Stop on failure; keep earlier successful restores and record unattempted apps"),
                details, point.verificationStatus(), point.verificationMessage(), simulation,
                backupVerificationService.restoreConfidence(point, affected), blocked.isEmpty(), Instant.now(),
                planId, jobId, List.copyOf(members), List.copyOf(blocked));
    }

    RestoreModels.RestorePlan requireReviewed(long restorePointId, String targetAppId, String planId) {
        requireReviewToken(planId);
        var current = restorePlan(restorePointId, targetAppId);
        if (!current.executable()) throw new InstallationException("Review the restore plan again. " + String.join(" ", current.blockedReasons()));
        if (!current.planId().substring(0, 64).equals(planId.substring(0, 64))) {
            throw new InstallationException("The archive, app ownership, storage, or restore scope changed. Review the restore plan again before applying it.");
        }
        return current;
    }

    static String reviewKey(long pointId, String appId, String planId) {
        return "restore:" + pointId + ":" + (appId == null || appId.isBlank() ? "all" : appId) + ":" + planId;
    }

    static void requireReviewToken(String planId) {
        if (planId == null || !planId.matches("[0-9a-f]{64}\\.[0-9a-f-]{36}")) {
            throw new InstallationException("Review the restore plan before applying this archive.");
        }
    }

    List<InstalledApp> affectedApps(RestorePoint point, String targetAppId) {
        Map<String, InstalledApp> managed = managedInstalledApps.get().stream()
                .collect(java.util.stream.Collectors.toMap(InstalledApp::appId, app -> app));
        return includedIds(point).stream().filter(id -> targetAppId == null || targetAppId.isBlank() || targetAppId.equals(id))
                .map(id -> {
                    var app = managed.get(id);
                    if (app == null) throw new InstallationException("The reviewed app scope changed. Review the restore plan again.");
                    return app;
                }).toList();
    }

    private List<String> includedIds(RestorePoint point) {
        return "full".equals(point.scope()) ? java.util.Arrays.stream(point.includedAppIds().split(","))
                .map(String::trim).filter(id -> !id.isBlank()).distinct().toList() : List.of(point.appId());
    }

    private String digest(List<String> values) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            for (String value : values) {
                byte[] bytes = String.valueOf(value).getBytes(StandardCharsets.UTF_8);
                digest.update(java.nio.ByteBuffer.allocate(Integer.BYTES).putInt(bytes.length).array());
                digest.update(bytes);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}

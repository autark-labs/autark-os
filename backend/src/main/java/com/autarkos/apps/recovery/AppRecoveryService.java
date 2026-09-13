package com.autarkos.apps.recovery;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.apps.ApplicationInventoryService;
import com.autarkos.apps.ApplicationRelationship;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.backups.BackupService;
import com.autarkos.backups.RecoveryOperationCoordinator;
import com.autarkos.host.HostModels;
import com.autarkos.host.ObservedService;
import com.autarkos.host.ObservedServiceService;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.install.AppAccessChecker;
import com.autarkos.marketplace.install.AppRuntimeMetadataReader;
import com.autarkos.marketplace.install.AppRuntimeMetadataWriter;
import com.autarkos.marketplace.install.ComposeRenderer;
import com.autarkos.marketplace.install.DockerComposeExecutor;
import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.marketplace.install.InstallStartupChecker;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.models.AccessModels;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.model.RuntimeServiceManifest;
import com.autarkos.network.tailscale.TailscaleServeResult;
import com.autarkos.network.tailscale.TailscaleServeConfig;
import com.autarkos.network.tailscale.TailscaleServeMapping;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.system.AutarkOsIdentity;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class AppRecoveryService {

    static final String CURRENT_INSTANCE_REGISTRATION_LOST = "current_instance_registration_lost";
    static final String PREVIOUS_INSTANCE = "previous_instance";
    static final String LEGACY_AUTARK = "legacy_autark";
    static final String INSUFFICIENT_EVIDENCE = "insufficient_evidence";

    private static final Pattern PUBLISHED_PORT = Pattern.compile("(?:^|:)(\\d+):\\d+(?:/(?:tcp|udp))?$");

    private final ApplicationInventoryService applicationInventory;
    private final ObservedServiceService observedServices;
    private final InstalledAppRepository installedApps;
    private final MarketplaceCatalogService catalog;
    private final AppRuntimeMetadataReader runtimeMetadataReader;
    private final DockerOwnershipService dockerOwnership;
    private final ActivityLogService activityLog;
    private final ApplicationStateService applicationState;
    private final DockerComposeExecutor composeExecutor;
    private final ComposeRenderer composeRenderer;
    private final AppRuntimeMetadataWriter runtimeMetadataWriter;
    private final BackupService backupService;
    private final RecoveryOperationCoordinator recoveryOperations;
    private final TailscaleService tailscaleService;
    private final AppAccessChecker accessChecker;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    public AppRecoveryService(
            ApplicationInventoryService applicationInventory,
            ObservedServiceService observedServices,
            InstalledAppRepository installedApps,
            MarketplaceCatalogService catalog,
            AppRuntimeMetadataReader runtimeMetadataReader,
            DockerOwnershipService dockerOwnership,
            ActivityLogService activityLog,
            ApplicationStateService applicationState,
            DockerComposeExecutor composeExecutor,
            ComposeRenderer composeRenderer,
            AppRuntimeMetadataWriter runtimeMetadataWriter,
            BackupService backupService,
            RecoveryOperationCoordinator recoveryOperations,
            TailscaleService tailscaleService) {
        this(applicationInventory, observedServices, installedApps, catalog, runtimeMetadataReader, dockerOwnership,
                activityLog, applicationState, composeExecutor, composeRenderer, runtimeMetadataWriter, backupService,
                recoveryOperations, tailscaleService, new AppAccessChecker());
    }

    AppRecoveryService(
            ApplicationInventoryService applicationInventory,
            ObservedServiceService observedServices,
            InstalledAppRepository installedApps,
            MarketplaceCatalogService catalog,
            AppRuntimeMetadataReader runtimeMetadataReader,
            DockerOwnershipService dockerOwnership,
            ActivityLogService activityLog,
            ApplicationStateService applicationState,
            DockerComposeExecutor composeExecutor,
            ComposeRenderer composeRenderer,
            AppRuntimeMetadataWriter runtimeMetadataWriter,
            BackupService backupService,
            RecoveryOperationCoordinator recoveryOperations,
            TailscaleService tailscaleService,
            AppAccessChecker accessChecker) {
        this.applicationInventory = applicationInventory;
        this.observedServices = observedServices;
        this.installedApps = installedApps;
        this.catalog = catalog;
        this.runtimeMetadataReader = runtimeMetadataReader;
        this.dockerOwnership = dockerOwnership;
        this.activityLog = activityLog;
        this.applicationState = applicationState;
        this.composeExecutor = composeExecutor;
        this.composeRenderer = composeRenderer;
        this.runtimeMetadataWriter = runtimeMetadataWriter;
        this.backupService = backupService;
        this.recoveryOperations = recoveryOperations;
        this.tailscaleService = tailscaleService;
        this.accessChecker = accessChecker;
    }

    public AppRecoveryService(
            ApplicationInventoryService applicationInventory,
            ObservedServiceService observedServices,
            InstalledAppRepository installedApps,
            MarketplaceCatalogService catalog,
            AppRuntimeMetadataReader runtimeMetadataReader,
            DockerOwnershipService dockerOwnership,
            ActivityLogService activityLog,
            ApplicationStateService applicationState) {
        this(applicationInventory, observedServices, installedApps, catalog, runtimeMetadataReader, dockerOwnership,
                activityLog, applicationState, null, null, null, null, null, null, null);
    }

    public List<AppRecoveryModels.RecoveryCandidate> list() {
        return applicationInventory.apps().stream()
                .filter(app -> app.relationship() == ApplicationRelationship.RECOVERY_REQUIRED)
                .map(app -> new AppRecoveryModels.RecoveryCandidate(
                        app.id(), app.name(), reasonFor(bestEvidence(app.id()).orElse(null)),
                        app.relationshipDescription(), "/api/app-recovery/" + encode(app.id()) + "/plan"))
                .toList();
    }

    public AppRecoveryModels.RecoveryPlan plan(String appId) {
        observedServices.refresh();
        return buildPlan(appId);
    }

    private AppRecoveryModels.RecoveryPlan buildPlan(String appId) {
        ApplicationManifest manifest = catalog.findById(appId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown catalog application: " + appId));
        ObservedService evidence = bestEvidence(appId).orElse(null);
        String reason = reasonFor(evidence);
        AutarkOsIdentity identity = dockerOwnership.currentIdentity();
        Path runtimePath = runtimePath(appId, evidence, identity);
        Optional<RuntimeModels.AppRuntimeMetadata> metadata = runtimeMetadataReader.read(runtimePath);
        Optional<ApplicationManifest> savedManifest = readSavedManifest(runtimePath);
        ApplicationManifest deployedManifest = savedManifest.orElse(manifest);
        ComposeInspection compose = inspectCompose(runtimePath.resolve("compose.yaml"), deployedManifest, runtimePath);
        List<ObservedService> containers = matchingDockerEvidence(appId);
        List<AppRecoveryModels.RecoveryCheck> checks = new ArrayList<>();

        boolean catalogIdentity = evidence != null && appId.equals(evidence.catalogAppId())
                && metadata.map(value -> appId.equals(value.catalogAppId())).orElse(false)
                && savedManifest.map(value -> appId.equals(value.id())).orElse(false);
        checks.add(check("catalog_identity", "App identity", catalogIdentity,
                catalogIdentity ? manifest.name() + " matches Docker, runtime metadata, and the saved release manifest."
                        : "Catalog identity could not be proven from Docker, runtime metadata, and the saved release manifest.",
                evidence == null ? "No matching Docker evidence." : "Docker match: " + blank(evidence.catalogMatchConfidence(), "unknown")));

        boolean releaseManifestReady = savedManifest.isPresent()
                && metadata.map(value -> value.manifestVersion() == null || value.manifestVersion().isBlank()
                        || value.manifestVersion().equals(savedManifest.orElseThrow().version())).orElse(false);
        checks.add(check("release_manifest", "Saved app release", releaseManifestReady,
                releaseManifestReady
                        ? "The app's original validated release manifest is available."
                        : "The saved app release is missing, invalid, or does not match runtime metadata.",
                savedManifest.map(value -> "Version " + blank(value.version(), "unknown")).orElse("No valid manifest.yaml")));

        String appInstanceId = metadata.map(RuntimeModels.AppRuntimeMetadata::appInstanceId).orElse("");
        Set<String> observedInstanceIds = containers.stream().map(service -> metadataValue(service, "appInstanceId"))
                .filter(value -> !value.isBlank()).collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        boolean instanceIdentity = !appInstanceId.isBlank()
                && (observedInstanceIds.isEmpty() || observedInstanceIds.equals(Set.of(appInstanceId)));
        checks.add(check("app_instance_identity", "App instance", instanceIdentity,
                instanceIdentity ? "App-instance identity is consistent." : "App-instance identity is missing or inconsistent.",
                blank(appInstanceId, "No app-instance ID found")));

        boolean runtimeSafe = safeRuntimePath(runtimePath, identity, appId) && Files.isDirectory(runtimePath);
        checks.add(check("runtime_path", "Runtime storage", runtimeSafe,
                runtimeSafe ? "The runtime folder is inside managed Autark-OS storage."
                        : "The runtime folder is missing or outside managed Autark-OS storage.", runtimePath.toString()));

        checks.add(check("compose", "Compose configuration", compose.valid(), compose.message(), runtimePath.resolve("compose.yaml").toString()));
        checks.add(check("mounts", "Mounted data", compose.mountsValid(), compose.mountMessage(), String.join(", ", compose.mounts())));

        boolean ownershipConsistent = ownershipConsistent(reason, containers, identity);
        checks.add(check("docker_ownership", "Previous ownership", ownershipConsistent,
                ownershipConsistent ? ownershipReadyMessage(reason) : ownershipMessage(reason),
                containers.stream().map(ObservedService::fingerprint).collect(java.util.stream.Collectors.joining(", "))));

        Set<Integer> conflicts = portConflicts(appId, compose.ports());
        checks.add(check("ports", "Published ports", conflicts.isEmpty(),
                conflicts.isEmpty() ? "The app's published ports have no conflict." : "Another service claims: " + conflicts,
                compose.ports().isEmpty() ? "No published ports" : compose.ports().toString()));

        boolean noManagedConflict = installedApps.findAppById(appId).isEmpty();
        checks.add(check("managed_record", "Managed registration", noManagedConflict,
                noManagedConflict ? "No managed app record will be overwritten."
                        : "A managed app record already exists and must not be overwritten.", appId));

        Optional<InstallModels.InstallSettings> resolvedSettings = recoverySettings(appId, deployedManifest, evidence, compose, runtimePath);
        boolean settingsReady = resolvedSettings.isPresent();
        checks.add(check("settings", "Managed settings", settingsReady,
                settingsReady ? installedApps.settingsFor(appId).isPresent()
                        ? "The original app settings are available."
                        : "Access and storage settings were reconstructed from the verified runtime."
                        : "Autark-OS cannot reconstruct complete app settings without guessing.",
                settingsReady ? "Settings are ready for the managed lifecycle." : "Existing resources remain unchanged."));

        boolean supportedReason = Set.of(CURRENT_INSTANCE_REGISTRATION_LOST, PREVIOUS_INSTANCE, LEGACY_AUTARK).contains(reason);
        boolean transferRequired = PREVIOUS_INSTANCE.equals(reason) || LEGACY_AUTARK.equals(reason);
        String sourceComposeProject = firstPresent(
                metadata.map(RuntimeModels.AppRuntimeMetadata::composeProject).orElse(""),
                metadataValue(evidence, "composeProject"));
        String targetComposeProject = dockerOwnership.composeProject(appId);
        boolean composeProjectsReady = !sourceComposeProject.isBlank() && !targetComposeProject.isBlank()
                && (transferRequired || sourceComposeProject.equals(targetComposeProject));
        checks.add(check("compose_project", "Compose ownership", composeProjectsReady,
                composeProjectsReady
                        ? "The previous and current Compose project identities are available."
                        : sourceComposeProject.isBlank() || targetComposeProject.isBlank()
                                ? "Autark-OS cannot safely identify both Compose projects."
                                : "The current-instance Compose project does not match the recorded runtime.",
                composeProjectsReady ? sourceComposeProject + " → " + targetComposeProject : "No complete project identity"));
        boolean lifecycleAvailable = supportedReason && checks.stream().allMatch(item -> "passed".equals(item.status()));
        checks.add(check("managed_lifecycle", "Complete managed lifecycle", lifecycleAvailable,
                lifecycleAvailable ? "Recovery will enable start, stop, restart, repair, settings, backup, update, and uninstall."
                        : "A complete managed lifecycle cannot be guaranteed from the current evidence.",
                lifecycleAvailable ? "Ready for reviewed recovery." : "Existing resources remain unchanged."));

        List<String> blocked = checks.stream().filter(item -> "blocked".equals(item.status()))
                .map(AppRecoveryModels.RecoveryCheck::message).distinct().toList();
        boolean applicable = blocked.isEmpty();
        String summary = applicable
                ? transferRequired
                        ? "Autark-OS can transfer management while preserving the app's mounted data and verified runtime configuration."
                        : "Autark-OS can restore the missing registration without changing the running app."
                : "Autark-OS found recovery evidence, but will not claim this app until every lifecycle check passes.";
        String planId = planId(appId, reason, runtimePath, sourceComposeProject, targetComposeProject,
                appInstanceId, containers, resolvedSettings.orElse(null));
        return new AppRecoveryModels.RecoveryPlan(
                appId, manifest.name(), reason, applicable, summary, planId, transferRequired,
                runtimePath.toString(), sourceComposeProject, targetComposeProject, appInstanceId,
                containers.stream().map(ObservedService::fingerprint).toList(), compose.mounts(),
                compose.ports().stream().map(String::valueOf).toList(), List.copyOf(checks),
                transferRequired
                        ? List.of("Create and verify a safety checkpoint", "Stop the previous Compose project",
                                "Transfer runtime ownership", "Restore app access", "Verify health and access",
                                "Commit managed app records")
                        : List.of("Re-read current-instance evidence", "Restore the missing managed registration",
                                "Refresh canonical application state"),
                blocked);
    }

    public boolean reviewedPlanMatches(AppRecoveryModels.RecoveryPlan plan, AppRecoveryModels.RecoveryApplyRequest request) {
        return request != null && request.planId() != null && request.planId().equals(plan.planId())
                && (!plan.ownershipTransferRequired() || request.ownershipTransferConfirmed());
    }

    public AppRecoveryModels.RecoveryResult apply(String appId, AppRecoveryModels.RecoveryApplyRequest request) {
        return apply(appId, request, ignored -> { });
    }

    public AppRecoveryModels.RecoveryResult apply(
            String appId,
            AppRecoveryModels.RecoveryApplyRequest request,
            Consumer<String> progress) {
        Consumer<String> sink = progress == null ? ignored -> { } : progress;
        if (recoveryOperations == null) {
            return applyLocked(appId, request, sink);
        }
        return recoveryOperations.runExclusive(
                RecoveryOperationCoordinator.Operation.APP_RECOVERY,
                () -> applyLocked(appId, request, sink));
    }

    private AppRecoveryModels.RecoveryResult applyLocked(
            String appId,
            AppRecoveryModels.RecoveryApplyRequest request,
            Consumer<String> progress) {
        progress.accept("inspect_current_state");
        observedServices.refresh();
        AppRecoveryModels.RecoveryPlan plan = buildPlan(appId);
        if (!plan.applicable()) {
            throw new InstallationException("Recovery is not safe yet. " + String.join(" ", plan.blockedReasons()));
        }
        if (request == null || request.planId() == null || !request.planId().equals(plan.planId())) {
            throw new InstallationException("The app changed after this recovery plan was reviewed. Review a fresh plan before continuing.");
        }
        if (plan.ownershipTransferRequired() && !request.ownershipTransferConfirmed()) {
            throw new InstallationException("Confirm the ownership transfer before recovering this app.");
        }

        Path runtimePath = Path.of(plan.runtimePath()).toAbsolutePath().normalize();
        Path composePath = runtimePath.resolve("compose.yaml");
        ApplicationManifest manifest = readSavedManifest(runtimePath)
                .orElseThrow(() -> new InstallationException("The app's saved release manifest is no longer available."));
        InstallModels.InstallSettings settings = recoverySettings(appId, manifest, bestEvidence(appId).orElse(null),
                inspectCompose(composePath, manifest, runtimePath), runtimePath)
                .orElseThrow(() -> new InstallationException("The verified app settings are no longer available."));

        if (!plan.ownershipTransferRequired()) {
            progress.accept("verify_recovery");
            requireManagedOwnership(appId, plan.appInstanceId());
            progress.accept("commit_management");
            boolean running = matchingDockerEvidence(appId).stream().anyMatch(this::running);
            commitManagedRecords(plan, manifest, settings, Instant.now(),
                    running ? AutarkOsStates.AppStatus.READY : AutarkOsStates.AppStatus.STOPPED);
            return completed(plan, manifest, "Autark-OS restored the missing app registration.");
        }

        requireRuntimeDependencies();
        RuntimeSnapshot original = snapshot(runtimePath);
        boolean sourceWasRunning = matchingDockerEvidence(appId).stream().anyMatch(this::running);
        boolean ownershipFilesChanged = false;
        AccessRollback accessRollback = null;
        try {
            progress.accept("create_safety_checkpoint");
            RuntimeModels.DockerComposeResult stopped = composeExecutor.down(composePath, plan.sourceComposeProject());
            if (!stopped.successful()) {
                throw new InstallationException("Docker could not stop the previous app project. " + output(stopped));
            }
            backupService.createRecoveryCheckpoint(appId, manifest.name());
            progress.accept("transfer_runtime");
            composeRenderer.transferOwnership(composePath, manifest, plan.appInstanceId(), plan.targetComposeProject());
            runtimeMetadataWriter.write(manifest, runtimePath, plan.appInstanceId(), plan.targetComposeProject());
            ownershipFilesChanged = true;
            RuntimeModels.DockerComposeResult started = composeExecutor.up(composePath, plan.targetComposeProject());
            if (!started.successful()) {
                throw new InstallationException("Docker could not recreate the app under current ownership. " + output(started));
            }

            InstallStartupChecker.StartupCheck startup = new InstallStartupChecker(composeExecutor).waitForStartup(
                    composePath, plan.targetComposeProject(), manifest.health(), expectedServices(manifest).stream().toList());
            if (!startup.ready()) {
                throw new InstallationException(startup.detail());
            }

            progress.accept("restore_access");
            AccessRecovery accessRecovery = restorePrivateAccess(appId, manifest, settings);
            accessRollback = accessRecovery.rollback();
            InstallModels.InstallSettings verifiedSettings = accessRecovery.settings();
            progress.accept("verify_recovery");
            verifyLocalAccess(appId, manifest, verifiedSettings.accessUrl());
            requireManagedOwnership(appId, plan.appInstanceId());
            if (!sourceWasRunning) {
                RuntimeModels.DockerComposeResult paused = composeExecutor.stopManagedProject(
                        composePath, plan.targetComposeProject(), appId);
                if (!paused.successful()) {
                    throw new InstallationException("Autark-OS could not return the recovered app to its previous stopped state. "
                            + output(paused));
                }
            }

            progress.accept("commit_management");
            commitManagedRecords(plan, manifest, verifiedSettings, Instant.now(),
                    sourceWasRunning ? AutarkOsStates.AppStatus.READY : AutarkOsStates.AppStatus.STOPPED);
            return completed(plan, manifest, "Autark-OS transferred ownership and verified the recovered app.");
        } catch (RuntimeException exception) {
            String rollback = ownershipFilesChanged
                    ? rollbackRuntime(plan, composePath, original, sourceWasRunning)
                    : restorePreviousRuntime(plan, composePath, sourceWasRunning);
            rollback = rollback + " " + rollbackPrivateAccess(accessRollback);
            applicationState.refreshNow();
            InstallationException failure = new InstallationException(
                    "Recovery did not complete. " + userMessage(exception) + " " + rollback, exception);
            activityLog.error("applications", "app_recovery_failed", "App recovery rolled back",
                    manifest.name() + " remains recoverable. " + rollback, appId, failure);
            throw failure;
        }
    }

    private AppRecoveryModels.RecoveryResult completed(
            AppRecoveryModels.RecoveryPlan plan,
            ApplicationManifest manifest,
            String eventMessage) {
        installedApps.recordEvent(plan.appId(), "app_recovered", eventMessage);
        activityLog.success("applications", "app_recovered", "App recovery completed",
                manifest.name() + " is fully managed by this Autark-OS installation.", plan.appId());
        return new AppRecoveryModels.RecoveryResult(true, "success", "App recovery completed",
                manifest.name() + " is fully managed by Autark-OS.", plan.appId(), "open_apps",
                applicationState.refreshNow());
    }

    private void commitManagedRecords(
            AppRecoveryModels.RecoveryPlan plan,
            ApplicationManifest manifest,
            InstallModels.InstallSettings settings,
            Instant now,
            String status) {
        InstalledApp app = new InstalledApp(plan.appId(), manifest.name(), status,
                plan.runtimePath(), plan.targetComposeProject(), settings.accessUrl(), now);
        RuntimeModels.InstalledAppOwnershipMetadata ownership = new RuntimeModels.InstalledAppOwnershipMetadata(
                plan.appId(), plan.appInstanceId(), plan.appId(), dockerOwnership.currentIdentity().instanceId(),
                plan.runtimePath(), "ready", "owned", now, now);
        installedApps.commitRecoveredApp(app, settings, ownership);
    }

    private void requireRuntimeDependencies() {
        if (composeExecutor == null || composeRenderer == null || runtimeMetadataWriter == null
                || backupService == null || tailscaleService == null || accessChecker == null) {
            throw new InstallationException("The complete recovery runtime is unavailable.");
        }
    }

    private RuntimeSnapshot snapshot(Path runtimePath) {
        try {
            Path metadataPath = runtimePath.resolve(AppRuntimeMetadataWriter.METADATA_FILE);
            return new RuntimeSnapshot(Files.readAllBytes(runtimePath.resolve("compose.yaml")),
                    Files.isRegularFile(metadataPath) ? Files.readAllBytes(metadataPath) : null);
        } catch (IOException exception) {
            throw new InstallationException("Autark-OS could not snapshot the existing runtime configuration.", exception);
        }
    }

    private String rollbackRuntime(
            AppRecoveryModels.RecoveryPlan plan,
            Path composePath,
            RuntimeSnapshot original,
            boolean sourceWasRunning) {
        List<String> failures = new ArrayList<>();
        try {
            RuntimeModels.DockerComposeResult removed = composeExecutor.down(composePath, plan.targetComposeProject());
            if (!removed.successful()) failures.add(output(removed));
        } catch (RuntimeException exception) {
            failures.add(userMessage(exception));
        }
        try {
            Files.write(composePath, original.compose());
            Path metadataPath = composePath.getParent().resolve(AppRuntimeMetadataWriter.METADATA_FILE);
            if (original.metadata() == null) Files.deleteIfExists(metadataPath);
            else Files.write(metadataPath, original.metadata());
        } catch (IOException exception) {
            failures.add("The original runtime files could not be restored: " + userMessage(exception));
        }
        if (sourceWasRunning) {
            try {
                RuntimeModels.DockerComposeResult restored = composeExecutor.up(composePath, plan.sourceComposeProject());
                if (!restored.successful()) failures.add(output(restored));
            } catch (RuntimeException exception) {
                failures.add(userMessage(exception));
            }
        }
        return failures.isEmpty()
                ? "Autark-OS restored the previous runtime arrangement; the app remains recoverable."
                : "Autark-OS could not completely restore the previous runtime: " + String.join(" ", failures);
    }

    private String restorePreviousRuntime(
            AppRecoveryModels.RecoveryPlan plan,
            Path composePath,
            boolean sourceWasRunning) {
        if (!sourceWasRunning) {
            return "The previous app was stopped and remains recoverable.";
        }
        try {
            RuntimeModels.DockerComposeResult restored = composeExecutor.up(composePath, plan.sourceComposeProject());
            return restored.successful()
                    ? "Autark-OS restored the previous runtime arrangement; the app remains recoverable."
                    : "Autark-OS could not restart the previous runtime: " + output(restored);
        } catch (RuntimeException exception) {
            return "Autark-OS could not restart the previous runtime: " + userMessage(exception);
        }
    }

    private AccessRecovery restorePrivateAccess(
            String appId,
            ApplicationManifest manifest,
            InstallModels.InstallSettings settings) {
        if (!wantsPrivateAccess(settings)) {
            return new AccessRecovery(settings, null);
        }
        Integer localPort = portFromUrl(settings.accessUrl());
        if (localPort == null) {
            throw new InstallationException("Autark-OS could not identify the local app port needed for private access.");
        }
        Integer storedPrivatePort = portFromUrl(settings.privateAccessUrl());
        int privatePort = storedPrivatePort == null ? defaultPrivatePort(appId, localPort) : storedPrivatePort;
        TailscaleServeConfig before = tailscaleService.serveConfig();
        if (before == null || !before.available()) {
            throw new InstallationException("Autark-OS could not capture the current private-access configuration for safe rollback.");
        }
        TailscaleServeMapping previous = before.mappings().stream()
                .filter(mapping -> Integer.valueOf(privatePort).equals(mapping.servePort()))
                .findFirst().orElse(null);
        AccessRollback rollback = new AccessRollback(privatePort, previous);
        TailscaleServeResult result = tailscaleService.serveHttps(localPort, privatePort);
        if (!result.configured()) {
            throw new InstallationException("Private access could not be restored. " + result.message() + " "
                    + rollbackPrivateAccess(rollback));
        }
        return new AccessRecovery(copySettings(settings, result.privateUrl()), rollback);
    }

    private String rollbackPrivateAccess(AccessRollback rollback) {
        if (rollback == null) return "Private access was unchanged.";
        try {
            TailscaleServeResult result;
            if (rollback.previous() == null) {
                result = tailscaleService.disableHttps(rollback.privatePort());
            } else if (rollback.previous().targetPort() != null) {
                result = tailscaleService.serveHttps(rollback.previous().targetPort(), rollback.privatePort());
            } else {
                return "Autark-OS could not identify the previous private-access target.";
            }
            return result.configured()
                    ? "Autark-OS restored the previous private-access mapping."
                    : "Autark-OS could not restore the previous private-access mapping: " + result.message();
        } catch (RuntimeException exception) {
            return "Autark-OS could not restore the previous private-access mapping: " + userMessage(exception);
        }
    }

    private void verifyLocalAccess(String appId, ApplicationManifest manifest, String accessUrl) {
        if (!accessChecker.shouldCheckLocalAccess(manifest, accessUrl)) {
            return;
        }
        AccessModels.AppAccessCheck check = null;
        for (int attempt = 0; attempt < 10; attempt++) {
            check = accessChecker.localHealthCheck(appId, manifest, accessUrl);
            if ("reachable".equals(check.status())) return;
            sleep();
        }
        throw new InstallationException(check == null ? "The app link could not be verified." : check.message());
    }

    private void requireManagedOwnership(String appId, String appInstanceId) {
        observedServices.refresh();
        String currentInstance = dockerOwnership.currentIdentity().instanceId();
        List<ObservedService> evidence = matchingDockerEvidence(appId);
        boolean managed = !evidence.isEmpty() && evidence.stream().allMatch(service ->
                "owned_managed".equals(service.ownershipState())
                        && currentInstance.equals(service.autarkOsInstanceId())
                        && appInstanceId.equals(metadataValue(service, "appInstanceId")));
        if (!managed) {
            throw new InstallationException("Autark-OS could not verify the new Docker ownership labels.");
        }
    }

    private Optional<InstallModels.InstallSettings> recoverySettings(
            String appId,
            ApplicationManifest manifest,
            ObservedService evidence,
            ComposeInspection compose,
            Path runtimePath) {
        Optional<InstallModels.InstallSettings> stored = installedApps.settingsFor(appId);
        if (stored.isPresent()) return stored;
        if (!compose.valid() || !compose.mountsValid()) return Optional.empty();
        Map<String, String> storage = storageSettings(manifest, compose.mounts(), runtimePath);
        if (storage == null) return Optional.empty();
        Integer localPort = compose.ports().stream().findFirst().orElse(null);
        String observedUrl = evidence == null ? "" : blank(evidence.url(), "");
        String accessUrl = accessUrl(observedUrl, localPort);
        if (accessUrl.isBlank() && localPort != null) accessUrl = "http://localhost:" + localPort;
        boolean browserAccessRequired = accessChecker == null || accessChecker.shouldCheckLocalAccess(manifest, accessUrl);
        if (browserAccessRequired && accessUrl.isBlank()) return Optional.empty();
        boolean privateAccess = manifest.usage().privateHttpsRequired()
                || (evidence != null && blank(evidence.accessScope(), "").toLowerCase(Locale.ROOT).contains("private"));
        String mode = privateAccess ? "private" : loopback(accessUrl) ? "local" : "network";
        return Optional.of(new InstallModels.InstallSettings(
                accessUrl.isBlank() ? null : accessUrl, null, privateAccess, storage,
                InstallModels.BackupPolicy.defaults(), mode,
                manifest.usage().privateHttpsRequired() ? "required" : "optional", localPort,
                protocol(accessUrl), null, null, null, null, true));
    }

    private Map<String, String> storageSettings(
            ApplicationManifest manifest,
            List<String> observedMounts,
            Path runtimePath) {
        Map<String, String> actualByTarget = new LinkedHashMap<>();
        for (String mapping : observedMounts) {
            Mount mount = mount(mapping);
            if (mount == null || actualByTarget.put(mount.target(), mount.source()) != null) return null;
        }
        List<Mount> expectedMounts = declaredVolumes(manifest).stream().map(this::mount).toList();
        if (expectedMounts.stream().anyMatch(java.util.Objects::isNull)
                || actualByTarget.size() != expectedMounts.size()) return null;
        Map<String, String> settings = new LinkedHashMap<>();
        for (Mount expected : expectedMounts) {
            String actual = actualByTarget.get(expected.target());
            if (actual == null) return null;
            if (!expected.source().startsWith(manifest.runtime().runtimeRoot())) {
                if (!actual.equals(expected.source())) return null;
                continue;
            }
            String key = expected.source().substring(manifest.runtime().runtimeRoot().length()).replaceFirst("^/+", "");
            if (key.isBlank() || actual == null || !actual.startsWith("/")) return null;
            Path actualPath = Path.of(actual).toAbsolutePath().normalize();
            if (!actualPath.startsWith(runtimePath)) return null;
            Path relative = runtimePath.relativize(actualPath);
            if (relative.getNameCount() != 1 || !relative.toString().matches("[A-Za-z0-9][A-Za-z0-9._-]{0,63}")) return null;
            settings.put(key, relative.toString());
        }
        return Map.copyOf(settings);
    }

    private List<String> declaredVolumes(ApplicationManifest manifest) {
        if (!manifest.runtime().multiService()) return manifest.runtime().volumes();
        return manifest.runtime().services().stream().flatMap(service -> service.volumes().stream()).distinct().toList();
    }

    private Optional<ObservedService> bestEvidence(String appId) {
        return matchingDockerEvidence(appId).stream().sorted(Comparator.comparingInt(this::evidencePriority)).findFirst();
    }

    private List<ObservedService> matchingDockerEvidence(String appId) {
        return observedServices.matchingCatalogServices(appId).stream()
                .filter(service -> HostModels.ObservedServiceSource.DOCKER.equals(service.source())).toList();
    }

    private int evidencePriority(ObservedService service) {
        return switch (service.ownershipState()) {
            case "owned_managed" -> 0;
            case "foreign_autark_os" -> 1;
            case "legacy_autark_os" -> 2;
            default -> 3;
        };
    }

    private String reasonFor(ObservedService evidence) {
        if (evidence == null) return INSUFFICIENT_EVIDENCE;
        return switch (evidence.ownershipState()) {
            case "owned_managed" -> installedApps.findAppById(evidence.catalogAppId()).isEmpty()
                    ? CURRENT_INSTANCE_REGISTRATION_LOST : INSUFFICIENT_EVIDENCE;
            case "foreign_autark_os" -> PREVIOUS_INSTANCE;
            case "legacy_autark_os" -> LEGACY_AUTARK;
            default -> INSUFFICIENT_EVIDENCE;
        };
    }

    private boolean ownershipConsistent(String reason, List<ObservedService> containers, AutarkOsIdentity identity) {
        if (containers.isEmpty()) return false;
        if (CURRENT_INSTANCE_REGISTRATION_LOST.equals(reason)) {
            return containers.stream().allMatch(service -> "owned_managed".equals(service.ownershipState())
                    && identity.instanceId().equals(service.autarkOsInstanceId()));
        }
        if (PREVIOUS_INSTANCE.equals(reason)) {
            Set<String> owners = containers.stream().map(ObservedService::autarkOsInstanceId)
                    .filter(value -> value != null && !value.isBlank()).collect(java.util.stream.Collectors.toSet());
            return owners.size() == 1 && containers.stream().allMatch(service -> "foreign_autark_os".equals(service.ownershipState()));
        }
        return LEGACY_AUTARK.equals(reason)
                && containers.stream().allMatch(service -> "legacy_autark_os".equals(service.ownershipState()));
    }

    private String ownershipReadyMessage(String reason) {
        return switch (reason) {
            case PREVIOUS_INSTANCE -> "All app containers agree on one previous Autark-OS owner; transfer requires confirmation.";
            case LEGACY_AUTARK -> "All app containers carry consistent legacy Autark-OS evidence; transfer requires confirmation.";
            default -> "All app containers belong to this Autark-OS installation.";
        };
    }

    private String ownershipMessage(String reason) {
        return switch (reason) {
            case PREVIOUS_INSTANCE -> "The app does not have one consistent previous Autark-OS owner.";
            case LEGACY_AUTARK -> "The legacy containers do not have consistent Autark-OS ownership evidence.";
            default -> "Docker ownership cannot be proven for the current Autark-OS installation.";
        };
    }

    private Path runtimePath(String appId, ObservedService evidence, AutarkOsIdentity identity) {
        String recorded = firstPresent(metadataValue(evidence, "runtimePath"), metadataValue(evidence, "dataPaths"));
        try {
            return Path.of(recorded.isBlank() ? identity.runtimeRoot() + "/apps/" + appId : recorded).toAbsolutePath().normalize();
        } catch (RuntimeException exception) {
            return Path.of(identity.runtimeRoot(), "apps", appId).toAbsolutePath().normalize();
        }
    }

    private boolean safeRuntimePath(Path path, AutarkOsIdentity identity, String appId) {
        try {
            Path apps = Path.of(identity.runtimeRoot()).toAbsolutePath().normalize().resolve("apps");
            Path expected = apps.resolve(appId).normalize();
            if (identity.runtimeRoot().isBlank() || !path.equals(expected)) return false;
            return !Files.exists(path) || path.toRealPath().startsWith(apps.toRealPath());
        } catch (IOException | RuntimeException exception) {
            return false;
        }
    }

    private ComposeInspection inspectCompose(Path composePath, ApplicationManifest manifest, Path runtimePath) {
        if (!Files.isRegularFile(composePath)) return ComposeInspection.invalid("The original Compose file is missing.");
        try {
            Object document = new Yaml(new SafeConstructor(new LoaderOptions())).load(Files.readString(composePath));
            if (!(document instanceof Map<?, ?> root) || !(root.get("services") instanceof Map<?, ?> services) || services.isEmpty()) {
                return ComposeInspection.invalid("The Compose file has no readable services.");
            }
            Set<String> expectedServices = expectedServices(manifest);
            Set<String> actualServices = services.keySet().stream().map(String::valueOf)
                    .collect(java.util.stream.Collectors.toSet());
            if (!actualServices.equals(expectedServices)) {
                return ComposeInspection.invalid("The Compose file does not exactly match the saved app release's services.");
            }
            Map<String, String> expectedImages = expectedImages(manifest);
            List<String> mounts = new ArrayList<>();
            Set<Integer> ports = new LinkedHashSet<>();
            boolean mountsValid = true;
            for (var entry : services.entrySet()) {
                Object serviceValue = entry.getValue();
                if (!(serviceValue instanceof Map<?, ?> service)) return ComposeInspection.invalid("The Compose file contains an invalid service definition.");
                String serviceName = String.valueOf(entry.getKey());
                if (!expectedImages.get(serviceName).equals(String.valueOf(service.get("image")))) {
                    return ComposeInspection.invalid("A Compose image does not match the saved app release.");
                }
                Object volumesValue = service.get("volumes");
                if (volumesValue != null && !(volumesValue instanceof List<?>)) mountsValid = false;
                if (volumesValue instanceof List<?> volumes) {
                    for (Object volume : volumes) {
                        if (!(volume instanceof String mapping) || !validMount(mapping)) mountsValid = false;
                        else mounts.add(mapping);
                    }
                }
                Object portsValue = service.get("ports");
                if (portsValue != null && !(portsValue instanceof List<?>)) return ComposeInspection.invalid("The Compose file contains an unsupported port definition.");
                if (portsValue instanceof List<?> mappings) {
                    for (Object value : mappings) {
                        Integer published = publishedPort(String.valueOf(value));
                        if (published == null) return ComposeInspection.invalid("The Compose file contains an unsupported port mapping.");
                        ports.add(published);
                    }
                }
            }
            if (mountsValid && storageSettings(manifest, mounts, runtimePath) == null) mountsValid = false;
            return new ComposeInspection(true, "The Compose file matches the catalog app.", mountsValid,
                    mountsValid ? "Mounted data can be preserved as managed storage."
                            : "A mounted data path cannot be represented safely by managed app settings.",
                    List.copyOf(mounts), Set.copyOf(ports));
        } catch (IOException | RuntimeException exception) {
            return ComposeInspection.invalid("The Compose file could not be parsed safely.");
        }
    }

    private Optional<ApplicationManifest> readSavedManifest(Path runtimePath) {
        Path path = runtimePath.resolve("manifest.yaml");
        if (!Files.isRegularFile(path)) return Optional.empty();
        try {
            ApplicationManifest manifest = new ManifestYamlReader().read(new FileSystemResource(path));
            new ManifestValidator().validate(manifest);
            return Optional.of(manifest);
        } catch (RuntimeException exception) {
            return Optional.empty();
        }
    }

    private Set<String> expectedServices(ApplicationManifest manifest) {
        if (manifest.runtime().multiService()) {
            return manifest.runtime().services().stream().map(RuntimeServiceManifest::name).collect(java.util.stream.Collectors.toSet());
        }
        return Set.of(manifest.runtime().containerName());
    }

    private Map<String, String> expectedImages(ApplicationManifest manifest) {
        Map<String, String> images = new LinkedHashMap<>();
        if (manifest.runtime().multiService()) {
            manifest.runtime().services().forEach(service -> images.put(service.name(), service.image()));
        } else {
            images.put(manifest.runtime().containerName(), manifest.runtime().image());
        }
        return Map.copyOf(images);
    }

    private boolean validMount(String mapping) {
        Mount mount = mount(mapping);
        if (mount == null || !mount.target().startsWith("/")) return false;
        return !mount.source().startsWith(".") && (!mount.source().startsWith("/") || Path.of(mount.source()).isAbsolute());
    }

    private Mount mount(String mapping) {
        if (mapping == null) return null;
        String[] parts = mapping.split(":");
        if (parts.length < 2) return null;
        int targetIndex = parts.length > 2 && Set.of("ro", "rw").contains(parts[parts.length - 1]) ? parts.length - 2 : parts.length - 1;
        if (targetIndex != 1) return null;
        return new Mount(parts[0], parts[targetIndex]);
    }

    private Integer publishedPort(String mapping) {
        String normalized = mapping.replace("0.0.0.0:", "").replace("127.0.0.1:", "");
        Matcher matcher = PUBLISHED_PORT.matcher(normalized);
        if (!matcher.find()) return null;
        try {
            int port = Integer.parseInt(matcher.group(1));
            return port > 0 && port <= 65535 ? port : null;
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private Set<Integer> portConflicts(String appId, Set<Integer> plannedPorts) {
        Set<Integer> conflicts = new LinkedHashSet<>();
        observedServices.observedServices().stream().filter(service -> !appId.equals(service.catalogAppId()))
                .map(service -> metadataValue(service, "ports")).flatMap(value -> portValues(value).stream())
                .filter(plannedPorts::contains).forEach(conflicts::add);
        return conflicts;
    }

    private Set<Integer> portValues(String value) {
        Set<Integer> ports = new LinkedHashSet<>();
        if (value == null) return ports;
        Matcher matcher = Pattern.compile("(?::|^)(\\d+)->").matcher(value);
        while (matcher.find()) {
            try {
                ports.add(Integer.parseInt(matcher.group(1)));
            } catch (NumberFormatException ignored) {
                // Ignore malformed observations; Compose validation remains authoritative.
            }
        }
        return ports;
    }

    private String planId(
            String appId,
            String reason,
            Path runtimePath,
            String sourceProject,
            String targetProject,
            String appInstanceId,
            List<ObservedService> containers,
            InstallModels.InstallSettings settings) {
        List<String> evidence = containers.stream().map(service -> String.join(":",
                        blank(service.fingerprint(), ""), blank(service.ownershipState(), ""),
                        blank(service.autarkOsInstanceId(), ""), blank(service.runtimeState(), ""),
                        metadataValue(service, "appInstanceId")))
                .sorted().toList();
        String material = String.join("|", appId, reason, runtimePath.toString(), sourceProject, targetProject,
                appInstanceId, fileHash(runtimePath.resolve("compose.yaml")),
                fileHash(runtimePath.resolve(AppRuntimeMetadataWriter.METADATA_FILE)), String.join(",", evidence), json(settings));
        return "recovery_" + sha256(material);
    }

    private String fileHash(Path path) {
        try {
            return Files.isRegularFile(path) ? sha256(Files.readString(path)) : "missing";
        } catch (IOException exception) {
            return "unreadable";
        }
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (IOException exception) {
            return String.valueOf(value);
        }
    }

    private String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte item : digest) result.append(String.format("%02x", item));
            return result.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    private AppRecoveryModels.RecoveryCheck check(String id, String label, boolean passed, String message, String detail) {
        return new AppRecoveryModels.RecoveryCheck(id, label, passed ? "passed" : "blocked", message, blank(detail, "No detail"));
    }

    private String metadataValue(ObservedService service, String key) {
        if (service == null || service.metadataJson() == null || service.metadataJson().isBlank()) return "";
        try {
            JsonNode value = objectMapper.readTree(service.metadataJson()).path(key);
            return value.isMissingNode() || value.isNull() ? "" : value.asText("").trim();
        } catch (IOException | RuntimeException exception) {
            return "";
        }
    }

    private InstallModels.InstallSettings copySettings(InstallModels.InstallSettings settings, String privateUrl) {
        return new InstallModels.InstallSettings(settings.accessUrl(), privateUrl, settings.tailscaleEnabled(),
                settings.storageSubfolders(), settings.backup(), settings.desiredAccessMode(),
                settings.privateAccessRequirement(), settings.expectedLocalPort(), settings.expectedProtocol(),
                settings.lastAccessCheckAt(), settings.lastSuccessfulAccessAt(), settings.lastRepairAttemptAt(),
                settings.lastRepairStatus(), settings.autoRepairEnabled());
    }

    private boolean wantsPrivateAccess(InstallModels.InstallSettings settings) {
        return settings.tailscaleEnabled() || "private".equals(settings.desiredAccessMode())
                || "local-and-private".equals(settings.desiredAccessMode())
                || "required".equals(settings.privateAccessRequirement());
    }

    private int defaultPrivatePort(String appId, int localPort) {
        int first = 12000;
        int count = 4000;
        int offset = Math.floorMod(appId.hashCode(), count);
        int candidate = first + offset;
        return candidate == localPort ? first + ((offset + 1) % count) : candidate;
    }

    private Integer portFromUrl(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            URI uri = URI.create(value);
            if (uri.getPort() > 0) return uri.getPort();
            return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : "http".equalsIgnoreCase(uri.getScheme()) ? 80 : null;
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private String accessUrl(String observedUrl, Integer port) {
        if (observedUrl == null || observedUrl.isBlank()) return "";
        try {
            URI uri = URI.create(observedUrl);
            if (port == null || uri.getPort() == port) return observedUrl;
        } catch (IllegalArgumentException ignored) {
            // The published Compose port remains authoritative.
        }
        return port == null ? "" : "http://localhost:" + port;
    }

    private boolean loopback(String accessUrl) {
        try {
            String host = URI.create(accessUrl).getHost();
            return "localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host) || "::1".equals(host);
        } catch (RuntimeException exception) {
            return true;
        }
    }

    private String protocol(String accessUrl) {
        try {
            return "https".equalsIgnoreCase(URI.create(accessUrl).getScheme()) ? "https" : "http";
        } catch (RuntimeException exception) {
            return "http";
        }
    }

    private boolean running(ObservedService service) {
        String state = blank(service.runtimeState(), "").toLowerCase(Locale.ROOT);
        return state.equals("running") || state.startsWith("up");
    }

    private String output(RuntimeModels.DockerComposeResult result) {
        String value = result == null || result.output() == null ? "" : String.join(" ", result.output()).trim();
        return value.isBlank() ? "Docker did not provide additional details." : value;
    }

    private String firstPresent(String... values) {
        for (String value : values) if (value != null && !value.isBlank()) return value.trim();
        return "";
    }

    private String blank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private String userMessage(Exception exception) {
        return exception.getMessage() == null || exception.getMessage().isBlank()
                ? "Autark-OS could not complete recovery." : exception.getMessage();
    }

    private void sleep() {
        try {
            Thread.sleep(500);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new InstallationException("Recovery was interrupted while verifying app access.", exception);
        }
    }

    private String encode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private record ComposeInspection(
            boolean valid,
            String message,
            boolean mountsValid,
            String mountMessage,
            List<String> mounts,
            Set<Integer> ports) {

        private static ComposeInspection invalid(String message) {
            return new ComposeInspection(false, message, false,
                    "Mount mappings cannot be verified until Compose is valid.", List.of(), Set.of());
        }
    }

    private record Mount(String source, String target) {
    }

    private record RuntimeSnapshot(byte[] compose, byte[] metadata) {
    }

    private record AccessRecovery(InstallModels.InstallSettings settings, AccessRollback rollback) {
    }

    private record AccessRollback(int privatePort, TailscaleServeMapping previous) {
    }
}

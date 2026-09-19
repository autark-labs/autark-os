package com.autarkos.marketplace.install;

import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

import org.springframework.stereotype.Service;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.backups.RecoveryOperationCoordinator;
import com.autarkos.host.DockerInventoryService;
import com.autarkos.host.ObservedService;
import com.autarkos.host.ObservedServiceService;
import com.autarkos.marketplace.api.InstallOptionsRequest;
import com.autarkos.marketplace.install.models.GuideModels;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.plan.InstallPlan;
import com.autarkos.marketplace.plan.InstallPlanService;
import com.autarkos.network.tailscale.TailscaleServeResult;
import com.autarkos.network.tailscale.TailscaleService;

@Service
public class MarketplaceInstallService {

    private final InstallPlanService installPlanService;
    private final RuntimeDirectoryManager directoryManager;
    private final CatalogPackageCopier packageCopier;
    private final ComposeRenderer composeRenderer;
    private final DockerComposeExecutor dockerComposeExecutor;
    private final InstalledAppRepository installedAppRepository;
    private final InstallCustomizationResolver customizationResolver;
    private final PostInstallProvisioner postInstallProvisioner;
    private final PostInstallGuideBuilder postInstallGuideBuilder;
    private final TailscaleService tailscaleService;
    private final ActivityLogService activityLogService;
    private final DockerOwnershipService dockerOwnershipService;
    private final AppRuntimeMetadataWriter appRuntimeMetadataWriter;
    private final ObservedServiceService observedServiceService;
    private final InstallStartupChecker startupChecker;
    private final ManagedAppAttestationService managedApps;
    private final DockerInventoryService dockerInventory;
    private final RecoveryOperationCoordinator recoveryOperations;

    public MarketplaceInstallService(
            InstallPlanService installPlanService,
            RuntimeDirectoryManager directoryManager,
            CatalogPackageCopier packageCopier,
            ComposeRenderer composeRenderer,
            DockerComposeExecutor dockerComposeExecutor,
            InstalledAppRepository installedAppRepository,
            InstallCustomizationResolver customizationResolver,
            PostInstallProvisioner postInstallProvisioner,
            PostInstallGuideBuilder postInstallGuideBuilder,
            TailscaleService tailscaleService,
            ActivityLogService activityLogService,
            DockerOwnershipService dockerOwnershipService,
            AppRuntimeMetadataWriter appRuntimeMetadataWriter,
            ObservedServiceService observedServiceService,
            ManagedAppAttestationService managedApps,
            DockerInventoryService dockerInventory,
            RecoveryOperationCoordinator recoveryOperations) {
        this.installPlanService = installPlanService;
        this.directoryManager = directoryManager;
        this.packageCopier = packageCopier;
        this.composeRenderer = composeRenderer;
        this.dockerComposeExecutor = dockerComposeExecutor;
        this.installedAppRepository = installedAppRepository;
        this.customizationResolver = customizationResolver;
        this.postInstallProvisioner = postInstallProvisioner;
        this.postInstallGuideBuilder = postInstallGuideBuilder;
        this.tailscaleService = tailscaleService;
        this.activityLogService = activityLogService;
        this.dockerOwnershipService = dockerOwnershipService;
        this.appRuntimeMetadataWriter = appRuntimeMetadataWriter;
        this.observedServiceService = observedServiceService;
        this.managedApps = managedApps;
        this.dockerInventory = dockerInventory;
        this.recoveryOperations = recoveryOperations;
        this.startupChecker = new InstallStartupChecker(dockerComposeExecutor);
    }

    public InstallModels.InstallResult install(ApplicationManifest manifest) {
        return install(manifest, InstallOptionsRequest.defaults());
    }

    public InstallModels.InstallResult install(ApplicationManifest manifest, InstallOptionsRequest options) {
        return install(manifest, options, ignored -> {
        });
    }

    public InstallModels.InstallResult install(ApplicationManifest manifest, InstallOptionsRequest options, Consumer<InstallModels.InstallStep> progressSink) {
        return recoveryOperations.runExclusive(
                RecoveryOperationCoordinator.Operation.APP_INSTALL,
                () -> installUnlocked(manifest, options, progressSink));
    }

    private InstallModels.InstallResult installUnlocked(ApplicationManifest manifest, InstallOptionsRequest options, Consumer<InstallModels.InstallStep> progressSink) {
        List<InstallModels.InstallStep> steps = new ArrayList<>();
        List<String> logs = new ArrayList<>();
        Consumer<InstallModels.InstallStep> sink = progressSink == null ? ignored -> { } : progressSink;
        InstallPlan plan = installPlanService.generatePlan(manifest, options);
        RuntimeModels.ResolvedRuntimeConfiguration runtimeConfiguration = customizationResolver.resolve(manifest, options);
        List<ObservedService> duplicates = matchingObservedDuplicates(manifest);
        List<ObservedService> previousAutarkOsDuplicates = previousAutarkOsDuplicates(duplicates);
        if (!previousAutarkOsDuplicates.isEmpty()) {
            String message = previousAutarkOsDuplicateMessage(manifest);
            recordStep(steps, sink, InstallModels.InstallStep.failed("Checking existing services", message));
            return new InstallModels.InstallResult(manifest.id(), manifest.name(), AutarkOsStates.JobStatus.FAILED, message, runtimeConfiguration.accessUrl(), plan, steps, logs, null, setupGuide(manifest, runtimeConfiguration.accessUrl(), null, GuideModels.PostInstallProvisioningResult.empty()));
        }
        if (!duplicates.isEmpty() && (options == null || !options.duplicateAcknowledgedRequested())) {
            String message = duplicateWarningMessage(manifest);
            recordStep(steps, sink, InstallModels.InstallStep.failed("Checking existing services", message));
            return new InstallModels.InstallResult(manifest.id(), manifest.name(), AutarkOsStates.JobStatus.FAILED, message, runtimeConfiguration.accessUrl(), plan, steps, logs, null, setupGuide(manifest, runtimeConfiguration.accessUrl(), null, GuideModels.PostInstallProvisioningResult.empty()));
        }
        InstalledApp existingApp = installedAppRepository.findAppById(manifest.id()).orElse(null);
        if (existingApp != null && !managedApps.attest(existingApp).managed()) {
            String message = manifest.name() + " has an incomplete managed registration. Review recovery in My Apps before installing or replacing it.";
            recordStep(steps, sink, InstallModels.InstallStep.failed("Checking managed ownership", message));
            return new InstallModels.InstallResult(manifest.id(), manifest.name(), AutarkOsStates.JobStatus.FAILED, message,
                    runtimeConfiguration.accessUrl(), plan, steps, logs, null,
                    setupGuide(manifest, existingApp.accessUrl(), null, GuideModels.PostInstallProvisioningResult.empty()));
        }
        if (existingApp != null && (options == null || !options.reinstallRequested())) {
            recordStep(steps, sink, InstallModels.InstallStep.completed("Already installed", manifest.name() + " is already managed by Autark-OS."));
            return new InstallModels.InstallResult(
                    manifest.id(),
                    manifest.name(),
                    "already_installed",
                    manifest.name() + " is already installed. Open it from Applications, or use an explicit reinstall option from Marketplace.",
                    existingApp.accessUrl(),
                    plan,
                    steps,
                    logs,
                    null,
                    setupGuide(manifest, existingApp.accessUrl(), null, GuideModels.PostInstallProvisioningResult.empty()));
        }
        Path appRoot = null;
        String composeProject = "";
        try {
            String appInstanceId = newAppInstanceId();
            composeProject = composeProject(manifest);
            activityInfo("install_started", "Installing " + manifest.name(), "Autark-OS is preparing storage, networking, and containers for " + manifest.name() + ".", manifest.id());
            recordStep(steps, sink, InstallModels.InstallStep.completed("Preparing app", "Validated manifest and generated install plan."));
            appRoot = directoryManager.prepare(manifest);
            recordStep(steps, sink, InstallModels.InstallStep.completed("Creating safe storage", appRoot.toString()));

            packageCopier.copyManifest(manifest, appRoot);
            packageCopier.copyProvisionedFiles(manifest, appRoot);
            recordStep(steps, sink, InstallModels.InstallStep.completed("Preparing app configuration", "Prepared the catalog configuration required to start " + manifest.name() + "."));
            Path composeFile = composeRenderer.render(manifest, appRoot, runtimeConfiguration, appInstanceId, composeProject);
            RuntimeModels.AppRuntimeMetadata runtimeMetadata = writeRuntimeMetadata(manifest, appRoot, appInstanceId, composeProject);
            recordStep(steps, sink, InstallModels.InstallStep.completed("Configuring private access", "Rendered Compose file with Autark-OS labels and local access at " + runtimeConfiguration.accessUrl() + "."));

            dockerInventory.requireFresh().requireMutationOwnership(manifest.id());
            RuntimeModels.DockerComposeResult composeResult = dockerComposeExecutor.up(composeFile, composeProject);
            logs.addAll(composeResult.output());
            if (!composeResult.successful()) {
                recordStep(steps, sink, InstallModels.InstallStep.failed("Starting services", "Docker Compose exited with code " + composeResult.exitCode()));
                installedAppRepository.recordEvent(manifest.id(), "install_failed", String.join("\n", composeResult.output()));
                recordFailedPartialInstall(manifest, runtimeConfiguration, appRoot, composeProject, "Docker Compose failed to start the app.", logs);
                activityWarning("install_failed", "Install failed for " + manifest.name(), "Docker Compose could not start the app containers.", manifest.id());
                return new InstallModels.InstallResult(manifest.id(), manifest.name(), AutarkOsStates.JobStatus.FAILED, "Docker Compose failed to start the app.", runtimeConfiguration.accessUrl(), plan, steps, logs, null, setupGuide(manifest, runtimeConfiguration.accessUrl(), null, GuideModels.PostInstallProvisioningResult.empty()));
            }
            recordStep(steps, sink, InstallModels.InstallStep.completed("Starting services", "Docker Compose started the managed services."));
            InstallStartupChecker.StartupCheck startupCheck = startupChecker.waitForStartup(
                    composeFile,
                    composeProject,
                    manifest.health(),
                    manifest.runtime() == null || manifest.runtime().services() == null
                            ? List.of()
                            : manifest.runtime().services().stream().map(com.autarkos.marketplace.model.RuntimeServiceManifest::name).toList());
            logs.addAll(startupCheck.logs());
            if (!startupCheck.ready()) {
                recordStep(steps, sink, InstallModels.InstallStep.failed("Checking app health", startupCheck.detail()));
                installedAppRepository.recordEvent(manifest.id(), "install_failed", startupCheck.detail());
                recordFailedPartialInstall(manifest, runtimeConfiguration, appRoot, composeProject, startupCheck.detail(), logs);
                activityWarning("install_failed", "Install needs attention for " + manifest.name(), startupCheck.detail(), manifest.id());
                return new InstallModels.InstallResult(manifest.id(), manifest.name(), AutarkOsStates.JobStatus.FAILED, startupCheck.detail(), runtimeConfiguration.accessUrl(), plan, steps, logs, null, setupGuide(manifest, runtimeConfiguration.accessUrl(), null, GuideModels.PostInstallProvisioningResult.empty()));
            }
            recordStep(steps, sink, InstallModels.InstallStep.completed("Checking app health", startupCheck.detail()));
            TailscaleServeResult privateAccess = configurePrivateAccess(manifest, runtimeConfiguration);
            logs.addAll(privateAccess.output());
            if (privateAccess.configured()) {
                recordStep(steps, sink, InstallModels.InstallStep.completed("Creating private HTTPS link", privateAccess.privateUrl()));
            } else if (privateAccessRequested(manifest, runtimeConfiguration)) {
                recordStep(steps, sink, InstallModels.InstallStep.warning(
                        "Creating private HTTPS link",
                        "Private access needs setup. " + privateAccess.message()));
            }
            String verifiedPrivateUrl = privateAccess.configured() ? privateAccess.privateUrl() : null;
            GuideModels.PostInstallProvisioningResult provisioningResult = postInstallProvisioner.provision(manifest, runtimeConfiguration.accessUrl());
            provisioningResult.steps().forEach(step -> recordStep(steps, sink, step));
            logs.addAll(provisioningResult.logs());
            GuideModels.PostInstallGuide postInstallGuide = postInstallGuideBuilder.build(manifest, runtimeConfiguration.accessUrl(), verifiedPrivateUrl, provisioningResult);

            recordStep(steps, sink, InstallModels.InstallStep.completed(manifest.health().successLabel(), readyDetail(manifest, runtimeConfiguration.accessUrl(), verifiedPrivateUrl)));
            installedAppRepository.save(new InstalledApp(
                    manifest.id(),
                    manifest.name(),
                    startupCheck.warmingUp() ? AutarkOsStates.AppStatus.STARTING : AutarkOsStates.AppStatus.READY,
                    appRoot.toString(),
                    composeProject,
                    runtimeConfiguration.accessUrl(),
                    Instant.now()));
            saveOwnershipMetadata(manifest, appRoot, runtimeMetadata, startupCheck.warmingUp() ? "starting" : "ready");
            ManagedAppAttestationService.Result attestation = managedApps.attest(manifest.id());
            if (!attestation.managed()) {
                installedAppRepository.deleteApp(manifest.id());
                String message = "Autark-OS could not confirm that this app is managed by this installation. " + attestation.message();
                recordStep(steps, sink, InstallModels.InstallStep.failed("Confirming ownership", message));
                recordFailedPartialInstall(manifest, runtimeConfiguration, appRoot, composeProject, message, logs);
                activityWarning("install_failed", "Install ownership check failed for " + manifest.name(), message, manifest.id());
                return new InstallModels.InstallResult(manifest.id(), manifest.name(), AutarkOsStates.JobStatus.FAILED, message, runtimeConfiguration.accessUrl(), plan, steps, logs, null, setupGuide(manifest, runtimeConfiguration.accessUrl(), verifiedPrivateUrl, provisioningResult));
            }
            installedAppRepository.saveSettings(manifest.id(), installSettings(manifest, runtimeConfiguration, privateAccess));
            installedAppRepository.recordEvent(manifest.id(), "installed", manifest.name() + " installed successfully.");
            clearFailedPartialInstall(manifest.id());
            activitySuccess("install_completed", "Installed " + manifest.name(), manifest.name() + " is installed and managed by Autark-OS.", manifest.id());

            return new InstallModels.InstallResult(manifest.id(), manifest.name(), "installed", manifest.name() + " is installed and managed by Autark-OS.", runtimeConfiguration.accessUrl(), plan, steps, logs, postInstallGuide, setupGuide(manifest, runtimeConfiguration.accessUrl(), verifiedPrivateUrl, provisioningResult));
        } catch (RuntimeException exception) {
            recordStep(steps, sink, InstallModels.InstallStep.failed("Install failed", exception.getMessage()));
            try {
                installedAppRepository.recordEvent(manifest.id(), "install_failed", exception.getMessage());
            } catch (RuntimeException ignored) {
                // Preserve the original install failure for the API response.
            }
            recordFailedPartialInstall(manifest, runtimeConfiguration, appRoot, composeProject, exception.getMessage(), logs);
            activityError("install_failed", "Install failed for " + manifest.name(), exception.getMessage(), manifest.id(), exception);
            return new InstallModels.InstallResult(manifest.id(), manifest.name(), AutarkOsStates.JobStatus.FAILED, exception.getMessage(), runtimeConfiguration.accessUrl(), plan, steps, logs, null, setupGuide(manifest, runtimeConfiguration.accessUrl(), null, GuideModels.PostInstallProvisioningResult.empty()));
        }
    }

    public void ensureDuplicateAcknowledgement(ApplicationManifest manifest, InstallOptionsRequest options) {
        if (!matchingObservedDuplicates(manifest).isEmpty() && (options == null || !options.duplicateAcknowledgedRequested())) {
            throw new DuplicateInstallAcknowledgementRequiredException(manifest.id(), duplicateWarningMessage(manifest));
        }
    }

    private List<ObservedService> matchingObservedDuplicates(ApplicationManifest manifest) {
        observedServiceService.refresh(dockerInventory.requireFresh());
        return observedServiceService.matchingCatalogServices(manifest.id()).stream()
                .filter(service -> !"owned_managed".equals(service.ownershipState()))
                .filter(service -> !"failed_install".equals(service.ownershipState()))
                .toList();
    }

    private List<ObservedService> previousAutarkOsDuplicates(List<ObservedService> duplicates) {
        return duplicates.stream()
                .filter(service -> "legacy_autark_os".equals(service.ownershipState()) || "foreign_autark_os".equals(service.ownershipState()))
                .toList();
    }

    private String previousAutarkOsDuplicateMessage(ApplicationManifest manifest) {
        return "Autark-OS found an existing " + manifest.name() + " service from another installation. During beta, Autark-OS will leave it unchanged and will not install over it.";
    }

    private String duplicateWarningMessage(ApplicationManifest manifest) {
        return "Autark-OS already sees " + manifest.name() + " on your system. Installing another copy can cause confusing behavior across your network. Review the existing service, or acknowledge that you intentionally want a separate copy.";
    }

    private void recordFailedPartialInstall(
            ApplicationManifest manifest,
            RuntimeModels.ResolvedRuntimeConfiguration runtimeConfiguration,
            Path appRoot,
            String composeProject,
            String message,
            List<String> logs) {
        if (appRoot == null) {
            return;
        }
        try {
            observedServiceService.recordFailedInstall(
                    manifest,
                    runtimeConfiguration.accessUrl(),
                    appRoot.toString(),
                    composeProject,
                    message,
                    logs);
        } catch (RuntimeException ignored) {
            // Preserve the original install failure for the API response.
        }
    }

    private void clearFailedPartialInstall(String appId) {
        try {
            observedServiceService.clearFailedInstall(appId);
        } catch (RuntimeException ignored) {
            // Install success should not be hidden by cleanup of an old failed marker.
        }
    }

    private void recordStep(List<InstallModels.InstallStep> steps, Consumer<InstallModels.InstallStep> sink, InstallModels.InstallStep step) {
        steps.add(step);
        sink.accept(step);
    }

    private String composeProject(ApplicationManifest manifest) {
        return dockerOwnershipService.composeProject(manifest.id());
    }

    private RuntimeModels.AppRuntimeMetadata writeRuntimeMetadata(ApplicationManifest manifest, Path appRoot, String appInstanceId, String composeProject) {
        return appRuntimeMetadataWriter.write(manifest, appRoot, appInstanceId, composeProject);
    }

    private void saveOwnershipMetadata(ApplicationManifest manifest, Path appRoot, RuntimeModels.AppRuntimeMetadata metadata, String installState) {
        installedAppRepository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
                manifest.id(),
                metadata.appInstanceId(),
                metadata.catalogAppId(),
                metadata.instanceId(),
                appRoot.toString(),
                installState,
                "owned",
                metadata.createdAt(),
                Instant.now()));
    }

    private String newAppInstanceId() {
        return "appinst_" + UUID.randomUUID().toString().replace("-", "");
    }

    private GuideModels.AppSetupGuide setupGuide(ApplicationManifest manifest, String accessUrl, String privateAccessUrl, GuideModels.PostInstallProvisioningResult provisioningResult) {
        return postInstallGuideBuilder.buildSetupGuide(
                manifest,
                accessUrl,
                privateAccessUrl,
                provisioningResult,
                installedAppRepository.findAllApps().stream().map(InstalledApp::appId).collect(java.util.stream.Collectors.toSet()));
    }

    private TailscaleServeResult configurePrivateAccess(ApplicationManifest manifest, RuntimeModels.ResolvedRuntimeConfiguration runtimeConfiguration) {
        if (!privateAccessRequested(manifest, runtimeConfiguration)) {
            return new TailscaleServeResult(false, null, "Private HTTPS access was not requested.", List.of());
        }
        Integer hostPort = portFromAccessUrl(runtimeConfiguration.accessUrl());
        if (hostPort == null) {
            return new TailscaleServeResult(false, null, "This app does not expose a local HTTP port for Tailscale Serve.", List.of());
        }
        int privateHttpsPort = AppPrivateAccessPorts.selectHttpsPort(manifest.id(), hostPort, installedAppRepository);
        return tailscaleService.serveHttps(hostPort, privateHttpsPort);
    }

    private InstallModels.InstallSettings installSettings(
            ApplicationManifest manifest,
            RuntimeModels.ResolvedRuntimeConfiguration runtimeConfiguration,
            TailscaleServeResult privateAccess) {
        String accessUrl = runtimeConfiguration.accessUrl();
        boolean privateAccessDesired = privateAccessRequested(manifest, runtimeConfiguration);
        return new InstallModels.InstallSettings(
                accessUrl,
                privateAccess.configured() ? privateAccess.privateUrl() : null,
                privateAccessDesired,
                runtimeConfiguration.storageSubfolders(),
                runtimeConfiguration.backup(),
                runtimeConfiguration.accessMode(),
                manifest.usage().privateHttpsRequired() ? "recommended" : "optional",
                portFromAccessUrl(accessUrl),
                protocolFromAccessUrl(accessUrl),
                null,
                null,
                null,
                null,
                true);
    }

    private boolean privateAccessRequested(ApplicationManifest manifest, RuntimeModels.ResolvedRuntimeConfiguration runtimeConfiguration) {
        return runtimeConfiguration.tailscaleEnabled() || manifest.usage().privateHttpsRequired();
    }

    private Integer portFromAccessUrl(String accessUrl) {
        return AppPrivateAccessPorts.portFromUrl(accessUrl);
    }

    private String protocolFromAccessUrl(String accessUrl) {
        if (accessUrl == null || accessUrl.isBlank()) {
            return "http";
        }
        try {
            String scheme = java.net.URI.create(accessUrl).getScheme();
            return "https".equalsIgnoreCase(scheme) ? "https" : "http";
        } catch (IllegalArgumentException exception) {
            return "http";
        }
    }

    private void activityInfo(String action, String title, String message, String appId) {
        activityLogService.info("marketplace", action, title, message, appId);
    }

    private void activitySuccess(String action, String title, String message, String appId) {
        activityLogService.success("marketplace", action, title, message, appId);
    }

    private void activityWarning(String action, String title, String message, String appId) {
        activityLogService.warning("marketplace", action, title, message, appId);
    }

    private void activityError(String action, String title, String message, String appId, RuntimeException exception) {
        activityLogService.error("marketplace", action, title, message, appId, exception);
    }

    private String readyDetail(ApplicationManifest manifest, String accessUrl, String privateAccessUrl) {
        if (manifest.usage().privateHttpsRequired() && privateAccessUrl != null && !privateAccessUrl.isBlank()) {
            return privateAccessUrl;
        }
        if ("companion-service".equals(manifest.usage().kind())) {
            return "Connection details are available in Applications.";
        }
        return accessUrl == null || accessUrl.isBlank() ? "Ready." : accessUrl;
    }

}

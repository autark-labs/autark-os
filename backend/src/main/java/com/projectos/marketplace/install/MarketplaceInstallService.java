package com.projectos.marketplace.install;

import com.projectos.marketplace.api.InstallOptionsRequest;

import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.projectos.activity.ActivityLogService;
import com.projectos.host.ObservedService;
import com.projectos.host.ObservedServiceService;
import com.projectos.marketplace.model.ApplicationManifest;
import com.projectos.marketplace.model.HealthManifest;
import com.projectos.marketplace.plan.InstallPlan;
import com.projectos.marketplace.plan.InstallPlanService;
import com.projectos.network.tailscale.TailscaleServeResult;
import com.projectos.network.tailscale.TailscaleService;

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

    @Autowired
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
            ObservedServiceService observedServiceService) {
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
    }

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
            AppRuntimeMetadataWriter appRuntimeMetadataWriter) {
        this(installPlanService, directoryManager, packageCopier, composeRenderer, dockerComposeExecutor, installedAppRepository, customizationResolver, postInstallProvisioner, postInstallGuideBuilder, tailscaleService, activityLogService, dockerOwnershipService, appRuntimeMetadataWriter, null);
    }

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
            TailscaleService tailscaleService) {
        this(installPlanService, directoryManager, packageCopier, composeRenderer, dockerComposeExecutor, installedAppRepository, customizationResolver, postInstallProvisioner, postInstallGuideBuilder, tailscaleService, null, null, null, null);
    }

    public InstallResult install(ApplicationManifest manifest) {
        return install(manifest, InstallOptionsRequest.defaults());
    }

    public InstallResult install(ApplicationManifest manifest, InstallOptionsRequest options) {
        return install(manifest, options, ignored -> {
        });
    }

    public InstallResult install(ApplicationManifest manifest, InstallOptionsRequest options, Consumer<InstallStep> progressSink) {
        List<InstallStep> steps = new ArrayList<>();
        List<String> logs = new ArrayList<>();
        Consumer<InstallStep> sink = progressSink == null ? ignored -> { } : progressSink;
        InstallPlan plan = installPlanService.generatePlan(manifest, options);
        ResolvedRuntimeConfiguration runtimeConfiguration = customizationResolver.resolve(manifest, options);
        List<ObservedService> duplicates = matchingObservedDuplicates(manifest);
        List<ObservedService> recoverableDuplicates = recoverableProjectOsDuplicates(duplicates);
        if (!recoverableDuplicates.isEmpty()) {
            String message = recoverableDuplicateMessage(manifest);
            recordStep(steps, sink, InstallStep.failed("Checking existing services", message));
            return new InstallResult(manifest.id(), manifest.name(), "failed", message, runtimeConfiguration.accessUrl(), plan, steps, logs, null, setupGuide(manifest, runtimeConfiguration.accessUrl(), null, PostInstallProvisioningResult.empty()));
        }
        if (!duplicates.isEmpty() && (options == null || !options.duplicateAcknowledgedRequested())) {
            String message = duplicateWarningMessage(manifest);
            recordStep(steps, sink, InstallStep.failed("Checking existing services", message));
            return new InstallResult(manifest.id(), manifest.name(), "failed", message, runtimeConfiguration.accessUrl(), plan, steps, logs, null, setupGuide(manifest, runtimeConfiguration.accessUrl(), null, PostInstallProvisioningResult.empty()));
        }
        InstalledApp existingApp = installedAppRepository.findById(manifest.id()).orElse(null);
        if (existingApp != null && (options == null || !options.reinstallRequested())) {
            recordStep(steps, sink, InstallStep.completed("Already installed", manifest.name() + " is already managed by Autark-OS."));
            return new InstallResult(
                    manifest.id(),
                    manifest.name(),
                    "already_installed",
                    manifest.name() + " is already installed. Open it from Applications, or use an explicit reinstall option from Marketplace.",
                    existingApp.accessUrl(),
                    plan,
                    steps,
                    logs,
                    null,
                    setupGuide(manifest, existingApp.accessUrl(), null, PostInstallProvisioningResult.empty()));
        }
        Path appRoot = null;
        String composeProject = "";
        try {
            String appInstanceId = newAppInstanceId();
            composeProject = composeProject(manifest);
            activityInfo("install_started", "Installing " + manifest.name(), "Autark-OS is preparing storage, networking, and containers for " + manifest.name() + ".", manifest.id());
            recordStep(steps, sink, InstallStep.completed("Preparing app", "Validated manifest and generated install plan."));
            appRoot = directoryManager.prepare(manifest);
            recordStep(steps, sink, InstallStep.completed("Creating safe storage", appRoot.toString()));

            packageCopier.copyManifest(manifest, appRoot);
            Path composeFile = composeRenderer.render(manifest, appRoot, runtimeConfiguration, appInstanceId, composeProject);
            AppRuntimeMetadata runtimeMetadata = writeRuntimeMetadata(manifest, appRoot, appInstanceId, composeProject);
            recordStep(steps, sink, InstallStep.completed("Configuring private access", "Rendered Compose file with Autark-OS labels and local access at " + runtimeConfiguration.accessUrl() + "."));

            DockerComposeResult composeResult = dockerComposeExecutor.up(composeFile, composeProject);
            logs.addAll(composeResult.output());
            if (!composeResult.successful()) {
                recordStep(steps, sink, InstallStep.failed("Starting services", "Docker Compose exited with code " + composeResult.exitCode()));
                installedAppRepository.recordEvent(manifest.id(), "install_failed", String.join("\n", composeResult.output()));
                recordFailedPartialInstall(manifest, runtimeConfiguration, appRoot, composeProject, "Docker Compose failed to start the app.", logs);
                activityWarning("install_failed", "Install failed for " + manifest.name(), "Docker Compose could not start the app containers.", manifest.id());
                return new InstallResult(manifest.id(), manifest.name(), "failed", "Docker Compose failed to start the app.", runtimeConfiguration.accessUrl(), plan, steps, logs, null, setupGuide(manifest, runtimeConfiguration.accessUrl(), null, PostInstallProvisioningResult.empty()));
            }
            recordStep(steps, sink, InstallStep.completed("Starting services", "Docker Compose started the managed services."));
            StartupCheck startupCheck = waitForStartup(composeFile, composeProject, manifest.health());
            logs.addAll(startupCheck.logs());
            if (!startupCheck.ready()) {
                recordStep(steps, sink, InstallStep.failed("Checking app health", startupCheck.detail()));
                installedAppRepository.recordEvent(manifest.id(), "install_failed", startupCheck.detail());
                recordFailedPartialInstall(manifest, runtimeConfiguration, appRoot, composeProject, startupCheck.detail(), logs);
                activityWarning("install_failed", "Install needs attention for " + manifest.name(), startupCheck.detail(), manifest.id());
                return new InstallResult(manifest.id(), manifest.name(), "failed", startupCheck.detail(), runtimeConfiguration.accessUrl(), plan, steps, logs, null, setupGuide(manifest, runtimeConfiguration.accessUrl(), null, PostInstallProvisioningResult.empty()));
            }
            recordStep(steps, sink, InstallStep.completed("Checking app health", startupCheck.detail()));
            TailscaleServeResult privateAccess = configurePrivateAccess(manifest, runtimeConfiguration);
            logs.addAll(privateAccess.output());
            if (privateAccess.configured()) {
                recordStep(steps, sink, InstallStep.completed("Creating private HTTPS link", privateAccess.privateUrl()));
            } else if (privateAccessRequested(manifest, runtimeConfiguration)) {
                recordStep(steps, sink, InstallStep.warning(
                        "Creating private HTTPS link",
                        "Private access needs setup. " + privateAccess.message()));
            }
            PostInstallProvisioningResult provisioningResult = postInstallProvisioner.provision(manifest, runtimeConfiguration.accessUrl());
            provisioningResult.steps().forEach(step -> recordStep(steps, sink, step));
            logs.addAll(provisioningResult.logs());
            PostInstallGuide postInstallGuide = postInstallGuideBuilder.build(manifest, runtimeConfiguration.accessUrl(), privateAccess.privateUrl(), provisioningResult);

            recordStep(steps, sink, InstallStep.completed(manifest.health().successLabel(), readyDetail(manifest, runtimeConfiguration.accessUrl(), privateAccess.privateUrl())));
            if (!ownershipReconcilesToManaged(manifest.id())) {
                String message = "Autark-OS could not confirm that this app is managed by this installation. The install was stopped so we do not show a service as installed when it is not under Autark-OS control.";
                recordStep(steps, sink, InstallStep.failed("Confirming ownership", message));
                installedAppRepository.recordEvent(manifest.id(), "install_failed", message);
                recordFailedPartialInstall(manifest, runtimeConfiguration, appRoot, composeProject, message, logs);
                activityWarning("install_failed", "Install ownership check failed for " + manifest.name(), message, manifest.id());
                return new InstallResult(manifest.id(), manifest.name(), "failed", message, runtimeConfiguration.accessUrl(), plan, steps, logs, null, setupGuide(manifest, runtimeConfiguration.accessUrl(), privateAccess.privateUrl(), provisioningResult));
            }

            installedAppRepository.save(new InstalledApp(
                    manifest.id(),
                    manifest.name(),
                    startupCheck.warmingUp() ? "Starting" : "Ready",
                    appRoot.toString(),
                    composeProject,
                    runtimeConfiguration.accessUrl(),
                    Instant.now()));
            saveOwnershipMetadata(manifest, appRoot, runtimeMetadata, startupCheck.warmingUp() ? "starting" : "ready");
            installedAppRepository.saveSettings(manifest.id(), installSettings(manifest, runtimeConfiguration, privateAccess));
            installedAppRepository.recordEvent(manifest.id(), "installed", manifest.name() + " installed successfully.");
            clearFailedPartialInstall(manifest.id());
            activitySuccess("install_completed", "Installed " + manifest.name(), manifest.name() + " is installed and managed by Autark-OS.", manifest.id());

            return new InstallResult(manifest.id(), manifest.name(), "installed", manifest.name() + " is installed and managed by Autark-OS.", runtimeConfiguration.accessUrl(), plan, steps, logs, postInstallGuide, setupGuide(manifest, runtimeConfiguration.accessUrl(), privateAccess.privateUrl(), provisioningResult));
        } catch (RuntimeException exception) {
            recordStep(steps, sink, InstallStep.failed("Install failed", exception.getMessage()));
            try {
                installedAppRepository.recordEvent(manifest.id(), "install_failed", exception.getMessage());
            } catch (RuntimeException ignored) {
                // Preserve the original install failure for the API response.
            }
            recordFailedPartialInstall(manifest, runtimeConfiguration, appRoot, composeProject, exception.getMessage(), logs);
            activityError("install_failed", "Install failed for " + manifest.name(), exception.getMessage(), manifest.id(), exception);
            return new InstallResult(manifest.id(), manifest.name(), "failed", exception.getMessage(), runtimeConfiguration.accessUrl(), plan, steps, logs, null, setupGuide(manifest, runtimeConfiguration.accessUrl(), null, PostInstallProvisioningResult.empty()));
        }
    }

    public void ensureDuplicateAcknowledgement(ApplicationManifest manifest, InstallOptionsRequest options) {
        if (!matchingObservedDuplicates(manifest).isEmpty() && (options == null || !options.duplicateAcknowledgedRequested())) {
            throw new DuplicateInstallAcknowledgementRequiredException(manifest.id(), duplicateWarningMessage(manifest));
        }
    }

    private List<ObservedService> matchingObservedDuplicates(ApplicationManifest manifest) {
        if (observedServiceService == null) {
            return List.of();
        }
        observedServiceService.refresh();
        return observedServiceService.matchingCatalogServices(manifest.id()).stream()
                .filter(service -> !"owned_managed".equals(service.ownershipState()))
                .filter(service -> !"failed_install".equals(service.ownershipState()))
                .toList();
    }

    private List<ObservedService> recoverableProjectOsDuplicates(List<ObservedService> duplicates) {
        return duplicates.stream()
                .filter(service -> "legacy_project_os".equals(service.ownershipState()) || "foreign_project_os".equals(service.ownershipState()))
                .toList();
    }

    private String recoverableDuplicateMessage(ApplicationManifest manifest) {
        return "Autark-OS found an existing " + manifest.name() + " service with Autark-OS runtime metadata. To avoid weird behavior across your network, recover the existing " + manifest.name() + " service from My Apps instead of installing another copy on top of it.";
    }

    private String duplicateWarningMessage(ApplicationManifest manifest) {
        return "Autark-OS already sees " + manifest.name() + " on your system. Installing another copy can cause confusing behavior across your network. Pin or adopt the existing service when possible, or acknowledge that you intentionally want a separate copy.";
    }

    private boolean ownershipReconcilesToManaged(String appId) {
        if (observedServiceService == null || appRuntimeMetadataWriter == null) {
            return true;
        }
        observedServiceService.refresh();
        String currentInstanceId = dockerOwnershipService == null ? "" : dockerOwnershipService.currentIdentity().instanceId();
        return observedServiceService.matchingCatalogServices(appId).stream()
                .anyMatch(service -> "owned_managed".equals(service.ownershipState())
                        && (currentInstanceId.isBlank()
                        || service.projectOsInstanceId() == null
                        || service.projectOsInstanceId().isBlank()
                        || currentInstanceId.equals(service.projectOsInstanceId())));
    }

    private void recordFailedPartialInstall(
            ApplicationManifest manifest,
            ResolvedRuntimeConfiguration runtimeConfiguration,
            Path appRoot,
            String composeProject,
            String message,
            List<String> logs) {
        if (observedServiceService == null || appRoot == null) {
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
        if (observedServiceService == null) {
            return;
        }
        try {
            observedServiceService.clearFailedInstall(appId);
        } catch (RuntimeException ignored) {
            // Install success should not be hidden by cleanup of an old failed marker.
        }
    }

    private void recordStep(List<InstallStep> steps, Consumer<InstallStep> sink, InstallStep step) {
        steps.add(step);
        sink.accept(step);
    }

    private String composeProject(ApplicationManifest manifest) {
        if (dockerOwnershipService == null) {
            return manifest.runtime().composeProject();
        }
        return dockerOwnershipService.composeProject(manifest.id());
    }

    private AppRuntimeMetadata writeRuntimeMetadata(ApplicationManifest manifest, Path appRoot, String appInstanceId, String composeProject) {
        if (appRuntimeMetadataWriter != null) {
            return appRuntimeMetadataWriter.write(manifest, appRoot, appInstanceId, composeProject);
        }
        return null;
    }

    private void saveOwnershipMetadata(ApplicationManifest manifest, Path appRoot, AppRuntimeMetadata metadata, String installState) {
        if (metadata == null) {
            return;
        }
        installedAppRepository.saveOwnershipMetadata(new InstalledAppOwnershipMetadata(
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

    private AppSetupGuide setupGuide(ApplicationManifest manifest, String accessUrl, String privateAccessUrl, PostInstallProvisioningResult provisioningResult) {
        return postInstallGuideBuilder.buildSetupGuide(
                manifest,
                accessUrl,
                privateAccessUrl,
                provisioningResult,
                installedAppRepository.findAll().stream().map(InstalledApp::appId).collect(java.util.stream.Collectors.toSet()));
    }

    private TailscaleServeResult configurePrivateAccess(ApplicationManifest manifest, ResolvedRuntimeConfiguration runtimeConfiguration) {
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

    private InstallSettings installSettings(
            ApplicationManifest manifest,
            ResolvedRuntimeConfiguration runtimeConfiguration,
            TailscaleServeResult privateAccess) {
        String accessUrl = runtimeConfiguration.accessUrl();
        boolean privateAccessDesired = privateAccessRequested(manifest, runtimeConfiguration);
        return new InstallSettings(
                accessUrl,
                privateAccess.privateUrl(),
                privateAccessDesired,
                runtimeConfiguration.storageSubfolders(),
                runtimeConfiguration.backup(),
                privateAccessDesired ? "private" : "local",
                manifest.usage().privateHttpsRequired() ? "recommended" : "optional",
                portFromAccessUrl(accessUrl),
                protocolFromAccessUrl(accessUrl),
                null,
                null,
                null,
                null,
                true);
    }

    private boolean privateAccessRequested(ApplicationManifest manifest, ResolvedRuntimeConfiguration runtimeConfiguration) {
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
        if (activityLogService != null) {
            activityLogService.info("marketplace", action, title, message, appId);
        }
    }

    private void activitySuccess(String action, String title, String message, String appId) {
        if (activityLogService != null) {
            activityLogService.success("marketplace", action, title, message, appId);
        }
    }

    private void activityWarning(String action, String title, String message, String appId) {
        if (activityLogService != null) {
            activityLogService.warning("marketplace", action, title, message, appId);
        }
    }

    private void activityError(String action, String title, String message, String appId, RuntimeException exception) {
        if (activityLogService != null) {
            activityLogService.error("marketplace", action, title, message, appId, exception);
        }
    }

    private StartupCheck waitForStartup(Path composeFile, String composeProject, HealthManifest health) {
        List<String> lastStatus = List.of();
        List<DockerContainerStatus> lastContainers = List.of();
        for (int attempt = 1; attempt <= 20; attempt++) {
            List<DockerContainerStatus> containers = dockerComposeExecutor.containers(composeFile, composeProject);
            lastContainers = containers;
            StartupCheck check = evaluateStartup(containers, health);
            lastStatus = check.logs();
            if (check.ready() || check.failed()) {
                return check;
            }
            sleep();
        }
        if (lastContainers.stream().anyMatch(this::running) && lastContainers.stream().noneMatch(this::failed)) {
            return StartupCheck.warmingUp("The service is running and still finishing startup checks. Autark-OS will keep watching it from Applications.", lastStatus);
        }
        String detail = "The app did not report ready within 20 seconds. Last container state: " + String.join("; ", lastStatus);
        return StartupCheck.failed(detail, lastStatus);
    }

    private StartupCheck evaluateStartup(List<DockerContainerStatus> containers, HealthManifest health) {
        if (containers.isEmpty()) {
            return StartupCheck.pending("Waiting for Docker to report the app container.", List.of("No containers reported yet."));
        }
        List<String> statusLines = containers.stream()
                .map(this::statusLine)
                .toList();
        List<String> failedContainers = containers.stream()
                .filter(this::failed)
                .map(this::statusLine)
                .toList();
        if (!failedContainers.isEmpty()) {
            return StartupCheck.failed("The app container stopped or reported unhealthy: " + String.join("; ", failedContainers), statusLines);
        }
        boolean starting = containers.stream().anyMatch(this::starting);
        boolean running = containers.stream().anyMatch(this::running);
        if (running && !starting) {
            return StartupCheck.ready(readinessDetail(health), statusLines);
        }
        return StartupCheck.pending(health.startingLabel(), statusLines);
    }

    private String readinessDetail(HealthManifest health) {
        if (health == null) {
            return "The app container is running.";
        }
        if (List.of("container", "no-web-ui", "none").contains(health.type())) {
            return health.description();
        }
        if ("tcp".equals(health.type())) {
            return "The service container is running. Autark-OS will keep checking the service port from Applications.";
        }
        return "The app container is running. Autark-OS will keep checking the app link from Applications.";
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

    private boolean running(DockerContainerStatus container) {
        String state = lower(container.state());
        String status = lower(container.status());
        return state.equals("running") || status.startsWith("up ");
    }

    private boolean starting(DockerContainerStatus container) {
        String state = lower(container.state());
        String health = lower(container.health());
        String status = lower(container.status());
        return state.equals("created")
                || state.equals("restarting")
                || health.equals("starting")
                || status.contains("starting");
    }

    private boolean failed(DockerContainerStatus container) {
        String state = lower(container.state());
        String health = lower(container.health());
        String status = lower(container.status());
        return state.equals("exited")
                || state.equals("dead")
                || health.equals("unhealthy")
                || status.contains("exited")
                || status.contains("unhealthy");
    }

    private String statusLine(DockerContainerStatus container) {
        return "%s state=%s health=%s status=%s".formatted(
                container.name(),
                container.state(),
                container.health(),
                container.status());
    }

    private String lower(String value) {
        return value == null ? "" : value.toLowerCase();
    }

    private void sleep() {
        try {
            Thread.sleep(1000);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new InstallationException("Interrupted while waiting for the app to start.", exception);
        }
    }

    private record StartupCheck(boolean ready, boolean failed, boolean warmingUp, String detail, List<String> logs) {
        private static StartupCheck ready(String detail, List<String> logs) {
            return new StartupCheck(true, false, false, detail, logs);
        }

        private static StartupCheck warmingUp(String detail, List<String> logs) {
            return new StartupCheck(true, false, true, detail, logs);
        }

        private static StartupCheck pending(String detail, List<String> logs) {
            return new StartupCheck(false, false, false, detail, logs);
        }

        private static StartupCheck failed(String detail, List<String> logs) {
            return new StartupCheck(false, true, false, detail, logs);
        }
    }
}

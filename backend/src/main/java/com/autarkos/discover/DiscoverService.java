package com.autarkos.discover;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.apps.ApplicationView;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.jobs.AutarkOsJobOutcome;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.jobs.AutarkOsJobStep;
import com.autarkos.marketplace.api.InstallOptionsRequest;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.MarketplaceInstallService;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.model.ApplicationManifest;

@Service
public class DiscoverService {

    private final MarketplaceCatalogService catalogService;
    private final Supplier<List<ApplicationView>> applications;
    private final DiscoverSetupService setupService;
    private final DiscoverInstallPreviewService previewService;
    private final MarketplaceInstallService marketplaceInstallService;
    private final AutarkOsJobService jobService;
    private final Runnable invalidateApplicationState;

    @Autowired
    public DiscoverService(
            MarketplaceCatalogService catalogService,
            ApplicationStateService applicationStateService,
            DiscoverSetupService setupService,
            DiscoverInstallPreviewService previewService,
            MarketplaceInstallService marketplaceInstallService,
            AutarkOsJobService jobService) {
        this(catalogService, () -> applicationStateService.snapshot().applications(), setupService, previewService, marketplaceInstallService, jobService, applicationStateService::invalidate);
    }

    public DiscoverService(
            MarketplaceCatalogService catalogService,
            Supplier<List<ApplicationView>> applications,
            DiscoverSetupService setupService,
            DiscoverInstallPreviewService previewService) {
        this(catalogService, applications, setupService, previewService, null, null, () -> {});
    }

    public DiscoverService(
            MarketplaceCatalogService catalogService,
            Supplier<List<ApplicationView>> applications,
            DiscoverSetupService setupService,
            DiscoverInstallPreviewService previewService,
            MarketplaceInstallService marketplaceInstallService,
            AutarkOsJobService jobService) {
        this(catalogService, applications, setupService, previewService, marketplaceInstallService, jobService, () -> {});
    }

    private DiscoverService(
            MarketplaceCatalogService catalogService,
            Supplier<List<ApplicationView>> applications,
            DiscoverSetupService setupService,
            DiscoverInstallPreviewService previewService,
            MarketplaceInstallService marketplaceInstallService,
            AutarkOsJobService jobService,
            Runnable invalidateApplicationState) {
        this.catalogService = catalogService;
        this.applications = applications;
        this.setupService = setupService;
        this.previewService = previewService;
        this.marketplaceInstallService = marketplaceInstallService;
        this.jobService = jobService;
        this.invalidateApplicationState = invalidateApplicationState;
    }

    public List<DiscoverAppView> apps() {
        Map<String, ApplicationView> applicationsById = applications.get().stream()
                .collect(java.util.stream.Collectors.toMap(ApplicationView::id, view -> view, (left, right) -> left));
        return catalogService.findAll().stream()
                .map(manifest -> appView(manifest, requiredApplication(manifest, applicationsById.get(manifest.id()))))
                .sorted(Comparator.comparing(view -> view.application().name(), String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public Optional<DiscoverAppView> app(String appId) {
        Map<String, ApplicationView> applicationsById = applications.get().stream()
                .collect(java.util.stream.Collectors.toMap(ApplicationView::id, view -> view, (left, right) -> left));
        return catalogService.findById(appId)
                .map(manifest -> appView(manifest, requiredApplication(manifest, applicationsById.get(manifest.id()))));
    }

    public DiscoverSetupModels.DiscoverSetupSchema setupSchema(String appId) {
        ApplicationManifest manifest = catalogService.findById(appId).orElseThrow(() -> new IllegalArgumentException("Unknown app: " + appId));
        return setupService.schema(manifest);
    }

    public DiscoverInstallModels.DiscoverInstallPreview installPreview(String appId, DiscoverSetupModels.DiscoverSetupAnswersRequest request) {
        ApplicationManifest manifest = catalogService.findById(appId).orElseThrow(() -> new IllegalArgumentException("Unknown app: " + appId));
        return previewService.preview(manifest, request);
    }

    public AutarkOsJob install(String appId, DiscoverInstallModels.DiscoverInstallRequest request) {
        if (marketplaceInstallService == null || jobService == null) {
            throw new IllegalStateException("Discover install jobs are not configured.");
        }
        ApplicationManifest manifest = catalogService.findById(appId).orElseThrow(() -> new IllegalArgumentException("Unknown app: " + appId));
        DiscoverSetupModels.DiscoverSetupAnswersRequest answersRequest = request == null ? new DiscoverSetupModels.DiscoverSetupAnswersRequest(Map.of()) : request.answersRequest();
        DiscoverSetupModels.DiscoverSetupAnswers answers = setupService.mergedAnswers(manifest, answersRequest);
        Map<String, Object> parameters = Map.of("answers", answers.values(),
                "reinstall", request != null && request.reinstallRequested(),
                "duplicateAcknowledged", request != null && request.duplicateAcknowledgedRequested());
        var existing = jobService.existingForRequest(AutarkOsStates.JobType.INSTALL_APP, appId, installJobSteps(manifest.name()), parameters);
        if (existing.isPresent()) return existing.get();
        DiscoverInstallModels.DiscoverInstallPreview preview = previewService.preview(manifest, answersRequest);
        if (!preview.valid()) {
            throw new IllegalArgumentException(preview.blockingIssues().getFirst().message());
        }
        AutarkOsJob job = jobService.startWithJob(AutarkOsStates.JobType.INSTALL_APP, appId, installJobSteps(manifest.name()), parameters, activeJob -> {
            setupService.persist(appId, manifest.id(), answers);
            List<AutarkOsJobStep> liveSteps = new ArrayList<>();
            InstallOptionsRequest installOptions = installOptions(preview.installOptions(), request);
            InstallModels.InstallResult result = marketplaceInstallService.install(manifest, installOptions, step -> {
                liveSteps.add(installStep(step));
                jobService.recordProgress(activeJob.jobId(), List.copyOf(liveSteps));
            });
            invalidateApplicationState.run();
            return installOutcome(result);
        });
        invalidateApplicationState.run();
        return job;
    }

    private InstallOptionsRequest installOptions(InstallOptionsRequest options, DiscoverInstallModels.DiscoverInstallRequest request) {
        return new InstallOptionsRequest(
                options.ports(),
                options.access(),
                options.storage(),
                options.backup(),
                request != null && request.reinstallRequested(),
                request != null && request.duplicateAcknowledgedRequested());
    }

    private DiscoverAppView appView(ApplicationManifest manifest, ApplicationView ownership) {
        return new DiscoverAppView(
                ownership,
                manifest,
                serviceKindLabel(manifest.usage().kind()),
                manifest.installTime(),
                manifest.difficulty(),
                setupService.schema(manifest));
    }

    private ApplicationView requiredApplication(ApplicationManifest manifest, ApplicationView application) {
        if (application == null) {
            throw new IllegalStateException("Canonical application inventory is missing " + manifest.id() + ".");
        }
        return application;
    }

    private String serviceKindLabel(String kind) {
        return switch (kind) {
            case "web-app" -> "App you open";
            case "companion-service" -> "Service you connect to";
            case "admin-service" -> "Setup tool";
            case "background-service" -> "Background service";
            case "infrastructure" -> "Infrastructure";
            default -> kind == null ? "App" : kind.replace("-", " ");
        };
    }

    private List<AutarkOsJobStep> installJobSteps(String appName) {
        return List.of(
                AutarkOsJobStep.pending("validate_setup", "Checking setup choices"),
                AutarkOsJobStep.pending("prepare_storage", "Preparing storage"),
                AutarkOsJobStep.pending("start_app", "Starting " + appName),
                AutarkOsJobStep.pending("check_app", "Checking that it opens"),
                AutarkOsJobStep.pending("finish", "Finishing install"));
    }

    private AutarkOsJobOutcome installOutcome(InstallModels.InstallResult result) {
        List<AutarkOsJobStep> steps = result.steps().stream()
                .map(this::installStep)
                .toList();
        if ("failed".equals(result.status())) {
            return AutarkOsJobOutcome.failed(result.message(), steps);
        }
        return AutarkOsJobOutcome.succeeded(result.message(), steps);
    }

    private AutarkOsJobStep installStep(InstallModels.InstallStep step) {
        String id = step.label().toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]+", "_").replaceAll("^_|_$", "");
        String status = "failed".equals(step.status()) ? "failed" : "completed".equals(step.status()) ? "succeeded" : step.status();
        return new AutarkOsJobStep(id.isBlank() ? "install_step" : id, step.label(), status, step.detail(), null, step.timestamp());
    }
}

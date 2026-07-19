package com.autarkos.discover;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.apps.AppOwnershipState;
import com.autarkos.apps.AppOwnershipView;
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
    private final Supplier<List<AppOwnershipView>> ownershipViews;
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
        this(catalogService, () -> applicationStateService.snapshot().ownershipViews(), setupService, previewService, marketplaceInstallService, jobService, applicationStateService::invalidate);
    }

    public DiscoverService(
            MarketplaceCatalogService catalogService,
            Supplier<List<AppOwnershipView>> ownershipViews,
            DiscoverSetupService setupService,
            DiscoverInstallPreviewService previewService) {
        this(catalogService, ownershipViews, setupService, previewService, null, null, () -> {});
    }

    public DiscoverService(
            MarketplaceCatalogService catalogService,
            Supplier<List<AppOwnershipView>> ownershipViews,
            DiscoverSetupService setupService,
            DiscoverInstallPreviewService previewService,
            MarketplaceInstallService marketplaceInstallService,
            AutarkOsJobService jobService) {
        this(catalogService, ownershipViews, setupService, previewService, marketplaceInstallService, jobService, () -> {});
    }

    private DiscoverService(
            MarketplaceCatalogService catalogService,
            Supplier<List<AppOwnershipView>> ownershipViews,
            DiscoverSetupService setupService,
            DiscoverInstallPreviewService previewService,
            MarketplaceInstallService marketplaceInstallService,
            AutarkOsJobService jobService,
            Runnable invalidateApplicationState) {
        this.catalogService = catalogService;
        this.ownershipViews = ownershipViews;
        this.setupService = setupService;
        this.previewService = previewService;
        this.marketplaceInstallService = marketplaceInstallService;
        this.jobService = jobService;
        this.invalidateApplicationState = invalidateApplicationState;
    }

    public List<DiscoverAppView> apps() {
        Map<String, AppOwnershipView> ownershipByAppId = ownershipViews.get().stream()
                .collect(java.util.stream.Collectors.toMap(AppOwnershipView::catalogAppId, view -> view, (left, right) -> left));
        return catalogService.findAll().stream()
                .map(manifest -> appView(manifest, ownershipOrAvailable(manifest, ownershipByAppId.get(manifest.id()))))
                .sorted(Comparator.comparing(DiscoverAppView::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public Optional<DiscoverAppView> app(String appId) {
        Map<String, AppOwnershipView> ownershipByAppId = ownershipViews.get().stream()
                .collect(java.util.stream.Collectors.toMap(AppOwnershipView::catalogAppId, view -> view, (left, right) -> left));
        return catalogService.findById(appId)
                .map(manifest -> appView(manifest, ownershipOrAvailable(manifest, ownershipByAppId.get(manifest.id()))));
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
        DiscoverInstallModels.DiscoverInstallPreview preview = previewService.preview(manifest, answersRequest);
        if (!preview.valid()) {
            throw new IllegalArgumentException(preview.blockingIssues().getFirst().message());
        }
        DiscoverSetupModels.DiscoverSetupAnswers answers = setupService.mergedAnswers(manifest, answersRequest);
        setupService.persist(appId, manifest.id(), answers);
        AutarkOsJob job = jobService.startWithJob(AutarkOsStates.JobType.INSTALL_APP, appId, installJobSteps(manifest.name()), activeJob -> {
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

    private DiscoverAppView appView(ApplicationManifest manifest, AppOwnershipView ownership) {
        return new DiscoverAppView(
                manifest.id(),
                manifest,
                manifest.name(),
                manifest.image(),
                firstPresent(manifest.shortValue(), manifest.plainLanguage(), manifest.description()),
                firstPresent(manifest.plainLanguage(), manifest.description()),
                manifest.category(),
                serviceKindLabel(manifest.usage().kind()),
                manifest.installTime(),
                manifest.difficulty(),
                ownership.state(),
                ownership.stateLabel(),
                ownership.stateDescription(),
                ownership.statusTone(),
                ownership.cardTone(),
                ownership.installed(),
                ownership.ownedByCurrentInstance(),
                ownership.installCopyWarningRequired(),
                ownership.reviewExistingHref(),
                ownership.primaryAction(),
                ownership.availableActions(),
                ownership.installedApp(),
                ownership.observedService(),
                setupService.schema(manifest));
    }

    private AppOwnershipView ownershipOrAvailable(ApplicationManifest manifest, AppOwnershipView ownership) {
        if (ownership != null) {
            return ownership;
        }
        AppOwnershipState state = AppOwnershipState.AVAILABLE;
        return new AppOwnershipView(
                manifest.id(),
                manifest.name(),
                manifest.category(),
                manifest.image(),
                firstPresent(manifest.shortValue(), manifest.plainLanguage(), manifest.description()),
                firstPresent(manifest.plainLanguage(), manifest.description()),
                state,
                "Available",
                "Ready to review before install.",
                "neutral",
                "neutral",
                false,
                false,
                false,
                null,
                new com.autarkos.apps.AppOwnershipAction("review_setup", "Review setup", "route", "/discover?app=" + encode(manifest.id()), null, false, ""),
                List.of(new com.autarkos.apps.AppOwnershipAction("review_setup", "Review setup", "route", "/discover?app=" + encode(manifest.id()), null, false, "")),
                null,
                null);
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

    private String firstPresent(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private String encode(String value) {
        return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8);
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

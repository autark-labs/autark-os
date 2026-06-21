package com.projectos.discover;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.projectos.host.HostInventoryProvider;
import com.projectos.host.HostInventoryResource;
import com.projectos.jobs.ProjectOsJob;
import com.projectos.jobs.ProjectOsJobOutcome;
import com.projectos.jobs.ProjectOsJobService;
import com.projectos.jobs.ProjectOsJobStep;
import com.projectos.marketplace.api.InstallOptionsRequest;
import com.projectos.marketplace.catalog.MarketplaceCatalogService;
import com.projectos.marketplace.install.InstallResult;
import com.projectos.marketplace.install.InstallStep;
import com.projectos.marketplace.install.InstalledApp;
import com.projectos.marketplace.install.InstalledAppRepository;
import com.projectos.marketplace.install.MarketplaceInstallService;
import com.projectos.marketplace.model.ApplicationManifest;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class DiscoverService {

    private final MarketplaceCatalogService catalogService;
    private final InstalledAppRepository installedAppRepository;
    private final HostInventoryProvider hostInventoryProvider;
    private final DiscoverSetupService setupService;
    private final DiscoverInstallPreviewService previewService;
    private final MarketplaceInstallService marketplaceInstallService;
    private final ProjectOsJobService jobService;

    @Autowired
    public DiscoverService(
            MarketplaceCatalogService catalogService,
            InstalledAppRepository installedAppRepository,
            HostInventoryProvider hostInventoryProvider,
            DiscoverSetupService setupService,
            DiscoverInstallPreviewService previewService,
            MarketplaceInstallService marketplaceInstallService,
            ProjectOsJobService jobService) {
        this.catalogService = catalogService;
        this.installedAppRepository = installedAppRepository;
        this.hostInventoryProvider = hostInventoryProvider;
        this.setupService = setupService;
        this.previewService = previewService;
        this.marketplaceInstallService = marketplaceInstallService;
        this.jobService = jobService;
    }

    public DiscoverService(
            MarketplaceCatalogService catalogService,
            InstalledAppRepository installedAppRepository,
            HostInventoryProvider hostInventoryProvider,
            DiscoverSetupService setupService,
            DiscoverInstallPreviewService previewService) {
        this(catalogService, installedAppRepository, hostInventoryProvider, setupService, previewService, null, null);
    }

    public List<DiscoverAppView> apps() {
        Map<String, InstalledApp> installed = installedAppRepository.findAll().stream()
                .collect(java.util.stream.Collectors.toMap(InstalledApp::appId, app -> app, (left, right) -> left));
        Map<String, HostInventoryResource> found = hostInventoryProvider.inventory(false).stream()
                .filter(resource -> resource.catalogAppId() != null && !resource.catalogAppId().isBlank() && !"owned_managed".equals(resource.ownershipState()))
                .collect(java.util.stream.Collectors.toMap(HostInventoryResource::catalogAppId, resource -> resource, (left, right) -> left));
        return catalogService.findAll().stream()
                .map(manifest -> appView(manifest, installed.get(manifest.id()), found.get(manifest.id())))
                .sorted(Comparator.comparing(DiscoverAppView::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public Optional<DiscoverAppView> app(String appId) {
        return catalogService.findById(appId).map(manifest -> {
            InstalledApp installed = installedAppRepository.findById(appId).orElse(null);
            HostInventoryResource found = hostInventoryProvider.inventory(false).stream()
                    .filter(resource -> appId.equals(resource.catalogAppId()) && !"owned_managed".equals(resource.ownershipState()))
                    .findFirst()
                    .orElse(null);
            return appView(manifest, installed, found);
        });
    }

    public DiscoverSetupSchema setupSchema(String appId) {
        ApplicationManifest manifest = catalogService.findById(appId).orElseThrow(() -> new IllegalArgumentException("Unknown app: " + appId));
        return setupService.schema(manifest);
    }

    public DiscoverInstallPreview installPreview(String appId, DiscoverSetupAnswersRequest request) {
        ApplicationManifest manifest = catalogService.findById(appId).orElseThrow(() -> new IllegalArgumentException("Unknown app: " + appId));
        return previewService.preview(manifest, request);
    }

    public ProjectOsJob install(String appId, DiscoverInstallRequest request) {
        if (marketplaceInstallService == null || jobService == null) {
            throw new IllegalStateException("Discover install jobs are not configured.");
        }
        ApplicationManifest manifest = catalogService.findById(appId).orElseThrow(() -> new IllegalArgumentException("Unknown app: " + appId));
        DiscoverSetupAnswersRequest answersRequest = request == null ? new DiscoverSetupAnswersRequest(Map.of()) : request.answersRequest();
        DiscoverInstallPreview preview = previewService.preview(manifest, answersRequest);
        if (!preview.valid()) {
            throw new IllegalArgumentException(preview.blockingIssues().getFirst().message());
        }
        DiscoverSetupAnswers answers = setupService.mergedAnswers(manifest, answersRequest);
        setupService.persist(appId, manifest.id(), answers);
        return jobService.startWithJob("install_app", appId, installJobSteps(manifest.name()), job -> {
            List<ProjectOsJobStep> liveSteps = new ArrayList<>();
            InstallOptionsRequest installOptions = installOptions(preview.installOptions(), request != null && request.reinstallRequested());
            InstallResult result = marketplaceInstallService.install(manifest, installOptions, step -> {
                liveSteps.add(installStep(step));
                jobService.recordProgress(job.jobId(), List.copyOf(liveSteps));
            });
            return installOutcome(result);
        });
    }

    private InstallOptionsRequest installOptions(InstallOptionsRequest options, boolean reinstall) {
        return new InstallOptionsRequest(options.ports(), options.access(), options.storage(), options.backup(), reinstall);
    }

    private DiscoverAppView appView(ApplicationManifest manifest, InstalledApp installed, HostInventoryResource found) {
        String state = state(manifest, installed, found);
        String primaryAction = primaryAction(state);
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
                state,
                stateLabel(state, found),
                stateDescription(state, found),
                primaryAction,
                primaryActionLabel(primaryAction),
                installed != null,
                installed == null ? null : new DiscoverInstalledAppSummary(installed.appId(), installed.appName(), installed.status(), installed.accessUrl()),
                found,
                setupService.schema(manifest));
    }

    private String state(ApplicationManifest manifest, InstalledApp installed, HostInventoryResource found) {
        if (installed != null) {
            return "installed";
        }
        if (found != null && "foreign_project_os".equals(found.ownershipState())) {
            return "managed_elsewhere";
        }
        if (found != null && "unknown_conflict".equals(found.ownershipState())) {
            return "blocked";
        }
        if (found != null) {
            return "found_on_server";
        }
        return "available";
    }

    private String stateLabel(String state, HostInventoryResource found) {
        return switch (state) {
            case "installed" -> "Installed";
            case "managed_elsewhere" -> "Managed elsewhere";
            case "blocked" -> "Blocked";
            case "found_on_server" -> "legacy_project_os".equals(found.ownershipState()) ? "Recoverable" : "Found on server";
            default -> "Available";
        };
    }

    private String stateDescription(String state, HostInventoryResource found) {
        return switch (state) {
            case "installed" -> "Managed by this Project OS installation.";
            case "managed_elsewhere", "blocked", "found_on_server" -> found.summary();
            default -> "Ready to review before install.";
        };
    }

    private String primaryAction(String state) {
        return switch (state) {
            case "installed" -> "manage";
            case "managed_elsewhere", "blocked", "found_on_server" -> "resolve";
            default -> "review_setup";
        };
    }

    private String primaryActionLabel(String action) {
        return switch (action) {
            case "manage" -> "Manage";
            case "resolve" -> "Resolve";
            default -> "Review setup";
        };
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

    private List<ProjectOsJobStep> installJobSteps(String appName) {
        return List.of(
                ProjectOsJobStep.pending("validate_setup", "Checking setup choices"),
                ProjectOsJobStep.pending("prepare_storage", "Preparing storage"),
                ProjectOsJobStep.pending("start_app", "Starting " + appName),
                ProjectOsJobStep.pending("check_app", "Checking that it opens"),
                ProjectOsJobStep.pending("finish", "Finishing install"));
    }

    private ProjectOsJobOutcome installOutcome(InstallResult result) {
        List<ProjectOsJobStep> steps = result.steps().stream()
                .map(this::installStep)
                .toList();
        if ("failed".equals(result.status())) {
            return ProjectOsJobOutcome.failed(result.message(), steps);
        }
        return ProjectOsJobOutcome.succeeded(result.message(), steps);
    }

    private ProjectOsJobStep installStep(InstallStep step) {
        String id = step.label().toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]+", "_").replaceAll("^_|_$", "");
        String status = "failed".equals(step.status()) ? "failed" : "completed".equals(step.status()) ? "succeeded" : step.status();
        return new ProjectOsJobStep(id.isBlank() ? "install_step" : id, step.label(), status, step.detail(), null, step.timestamp());
    }
}

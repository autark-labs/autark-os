package com.projectos.marketplace.api;

import java.util.List;
import java.util.Locale;
import java.util.ArrayList;
import java.util.Collections;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.projectos.jobs.ProjectOsJob;
import com.projectos.jobs.ProjectOsJobOutcome;
import com.projectos.jobs.ProjectOsJobService;
import com.projectos.jobs.ProjectOsJobStep;
import com.projectos.marketplace.catalog.MarketplaceCatalogService;
import com.projectos.marketplace.api.InstallOptionsRequest;
import com.projectos.marketplace.install.InstallResult;
import com.projectos.marketplace.install.InstallStep;
import com.projectos.marketplace.install.MarketplaceInstallService;
import com.projectos.marketplace.model.ApplicationManifest;
import com.projectos.marketplace.plan.InstallPlan;
import com.projectos.marketplace.plan.InstallPlanService;

@RestController
@RequestMapping("/api/marketplace/apps")
public class MarketplaceController {

    private final MarketplaceCatalogService catalogService;
    private final InstallPlanService installPlanService;
    private final MarketplaceInstallService marketplaceInstallService;
    private final ProjectOsJobService jobService;

    public MarketplaceController(MarketplaceCatalogService catalogService, InstallPlanService installPlanService, MarketplaceInstallService marketplaceInstallService, ProjectOsJobService jobService) {
        this.catalogService = catalogService;
        this.installPlanService = installPlanService;
        this.marketplaceInstallService = marketplaceInstallService;
        this.jobService = jobService;
    }

    @GetMapping
    public List<ApplicationManifest> apps() {
        return catalogService.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApplicationManifest> app(@PathVariable String id) {
        return catalogService.findById(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/plan")
    public ResponseEntity<InstallPlan> plan(@PathVariable String id, @RequestBody(required = false) InstallOptionsRequest options) {
        return catalogService.findById(id)
                .map(manifest -> installPlanService.generatePlan(manifest, options))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/install")
    public ResponseEntity<ProjectOsJob> install(@PathVariable String id, @RequestBody(required = false) InstallOptionsRequest options) {
        return catalogService.findById(id)
                .map(manifest -> jobService.startWithJob("install_app", manifest.id(), installJobSteps(manifest.name()), job -> {
                    List<ProjectOsJobStep> liveSteps = Collections.synchronizedList(new ArrayList<>());
                    InstallResult result = marketplaceInstallService.install(manifest, options, step -> {
                        liveSteps.add(installStep(step));
                        jobService.recordProgress(job.jobId(), List.copyOf(liveSteps));
                    });
                    return installOutcome(result);
                }))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    private List<ProjectOsJobStep> installJobSteps(String appName) {
        return List.of(
                ProjectOsJobStep.pending("validate_host", "Checking this device"),
                ProjectOsJobStep.pending("prepare_storage", "Preparing storage"),
                ProjectOsJobStep.pending("download_app", "Downloading " + appName),
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
        String id = step.label().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "_").replaceAll("^_|_$", "");
        String status = "failed".equals(step.status()) ? "failed" : "completed".equals(step.status()) ? "succeeded" : step.status();
        return new ProjectOsJobStep(id.isBlank() ? "install_step" : id, step.label(), status, step.detail(), null, step.timestamp());
    }
}

package com.projectos.marketplace.api;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.projectos.marketplace.catalog.MarketplaceCatalogService;
import com.projectos.marketplace.api.InstallOptionsRequest;
import com.projectos.marketplace.install.InstallResult;
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

    public MarketplaceController(MarketplaceCatalogService catalogService, InstallPlanService installPlanService, MarketplaceInstallService marketplaceInstallService) {
        this.catalogService = catalogService;
        this.installPlanService = installPlanService;
        this.marketplaceInstallService = marketplaceInstallService;
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
    public ResponseEntity<InstallResult> install(@PathVariable String id, @RequestBody(required = false) InstallOptionsRequest options) {
        return catalogService.findById(id)
                .map(manifest -> marketplaceInstallService.install(manifest, options))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}

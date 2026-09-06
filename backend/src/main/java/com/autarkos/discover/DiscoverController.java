package com.autarkos.discover;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.system.BetaScope;
import com.autarkos.marketplace.install.models.InstallModels;

@RestController
@RequestMapping("/api/discover/apps")
public class DiscoverController {

    private final DiscoverService discoverService;

    public DiscoverController(DiscoverService discoverService) {
        this.discoverService = discoverService;
    }

    @GetMapping
    public List<DiscoverAppView> apps() {
        return discoverService.apps().stream().filter(app -> BetaScope.allowsInstall(app.id())).toList();
    }

    @GetMapping("/{appId}")
    public ResponseEntity<DiscoverAppView> app(@PathVariable String appId) {
        if (!BetaScope.allowsInstall(appId)) {
            return ResponseEntity.notFound().build();
        }
        return discoverService.app(appId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/{appId}/setup-schema")
    public DiscoverSetupModels.DiscoverSetupSchema setupSchema(@PathVariable String appId) {
        BetaScope.requireInstall(appId);
        return discoverService.setupSchema(appId);
    }

    @PostMapping("/{appId}/install-preview")
    public DiscoverInstallModels.DiscoverInstallPreview installPreview(@PathVariable String appId, @RequestBody(required = false) DiscoverSetupModels.DiscoverSetupAnswersRequest request) {
        BetaScope.requireInstall(appId);
        return discoverService.installPreview(appId, request);
    }

    @PostMapping("/{appId}/install")
    public AutarkOsJob install(@PathVariable String appId, @RequestBody(required = false) DiscoverInstallModels.DiscoverInstallRequest request) {
        BetaScope.requireInstall(appId);
        return discoverService.install(appId, request);
    }
}

package com.autarkos.marketplace.install;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.autarkos.apps.ApplicationStateService;
import com.autarkos.apps.ApplicationViews;
import com.autarkos.marketplace.install.models.AccessModels;
import com.autarkos.network.tailscale.TailscaleServeConfig;
import com.autarkos.network.tailscale.TailscaleServeMapping;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.network.tailscale.TailscaleStatus;

@Service
public class PrivateAccessReconciliationService {

    private final ApplicationStateService applicationStateService;
    private final TailscaleService tailscaleService;
    private final PrivateAccessStateResolver stateResolver;

    public PrivateAccessReconciliationService(ApplicationStateService applicationStateService, TailscaleService tailscaleService, InstalledAppRepository repository) {
        this.applicationStateService = applicationStateService;
        this.tailscaleService = tailscaleService;
        this.stateResolver = new PrivateAccessStateResolver(repository, tailscaleService);
    }

    public AccessModels.PrivateAccessReconciliationReport report() {
        TailscaleStatus status = tailscaleService.status();
        List<AppRuntimeView> privateApps = runtimeApps().stream()
                .filter(this::wantsPrivateAccess)
                .toList();
        if (!status.installed()) {
            return unavailableReport(privateApps.isEmpty() ? "optional" : "warning", "Install Tailscale to verify private links", "Autark-OS cannot inspect private app links until Tailscale is installed.", privateApps, status);
        }
        if (!status.connected()) {
            return unavailableReport(privateApps.isEmpty() ? "optional" : "warning", "Connect Tailscale to verify private links", "Autark-OS cannot inspect private app links until this device is connected.", privateApps, status);
        }

        TailscaleServeConfig config = tailscaleService.serveConfig();
        if (!config.available()) return unavailableReport("unavailable", "Private links could not be checked", config.message(), privateApps, status);
        List<AccessModels.PrivateAccessReconciliationItem> items = privateApps.stream()
                .map(app -> reconcile(app, status, config))
                .toList();
        List<AccessModels.PrivateAccessStaleMapping> staleMappings = staleMappings(privateApps, config, status);
        boolean warning = items.stream().anyMatch(item -> !"healthy".equals(item.status())) || !staleMappings.isEmpty();
        long healthy = items.stream().filter(item -> "healthy".equals(item.status())).count();
        return new AccessModels.PrivateAccessReconciliationReport(
                warning ? "warning" : "healthy",
                warning ? "Some private links need review" : "Private links are verified",
                healthy + " of " + items.size() + " private app link(s) match Tailscale Serve."
                        + (staleMappings.isEmpty() ? "" : " " + staleMappings.size() + " unassigned mapping(s) need review."),
                items,
                staleMappings,
                Instant.now());
    }

    private AccessModels.PrivateAccessReconciliationReport unavailableReport(String status, String headline, String summary, List<AppRuntimeView> apps, TailscaleStatus tailscale) {
        TailscaleServeConfig config = TailscaleServeConfig.unavailable("not_connected", summary, List.of());
        List<AccessModels.PrivateAccessReconciliationItem> items = apps.stream()
                .map(app -> reconcile(app, tailscale, config))
                .toList();
        return new AccessModels.PrivateAccessReconciliationReport(status, headline, summary, items, List.of(), Instant.now());
    }

    private AccessModels.PrivateAccessReconciliationItem reconcile(AppRuntimeView app, TailscaleStatus tailscale, TailscaleServeConfig config) {
        PrivateAccessState state = stateResolver.resolve(app.appId(), app.settings(), app.accessUrl(), tailscale, config);
        TailscaleServeMapping mapping = state.mapping();
        return new AccessModels.PrivateAccessReconciliationItem(
                app.appId(),
                app.appName(),
                state.verified() ? "healthy" : state.status(),
                state.message(),
                state.detail(),
                state.actionLabel(),
                state.expectedPrivateUrl(),
                state.verifiedPrivateUrl(),
                state.expectedLocalPort(),
                mapping == null ? null : mapping.servePort(),
                mapping == null ? null : mapping.target(),
                state.expectedLocalPort(),
                state.expectedHttpsPort(),
                storedPrivateUrl(app),
                desiredMapping(state.expectedHttpsPort(), state.expectedLocalPort()),
                state.liveMappings(),
                state.matchReason(),
                state.verifiedAt());
    }

    private boolean wantsPrivateAccess(AppRuntimeView app) {
        if (app.settings() != null && app.settings().tailscaleEnabled()) {
            return true;
        }
        return app.desiredAccess() != null
                && ("private".equals(app.desiredAccess().mode()) || "local-and-private".equals(app.desiredAccess().mode()) || app.desiredAccess().privateAccessRequired());
    }

    private String storedPrivateUrl(AppRuntimeView app) {
        return app.settings() == null ? null : app.settings().privateAccessUrl();
    }

    private String desiredMapping(Integer expectedHttpsPort, Integer expectedLocalPort) {
        String https = expectedHttpsPort == null ? "unknown HTTPS endpoint" : "https:" + expectedHttpsPort;
        String local = expectedLocalPort == null ? "unknown local app port" : "127.0.0.1:" + expectedLocalPort;
        return https + " -> " + local;
    }

    private List<AccessModels.PrivateAccessStaleMapping> staleMappings(List<AppRuntimeView> privateApps, TailscaleServeConfig config, TailscaleStatus tailscale) {
        if (!config.available() || "dev_mock".equals(config.status())) {
            return List.of();
        }
        Set<Integer> expectedPorts = privateApps.stream()
                .map(app -> stateResolver.resolve(app.appId(), app.settings(), app.accessUrl(), tailscale, config).expectedHttpsPort())
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        return config.mappings().stream()
                .filter(mapping -> mapping.servePort() != null)
                .filter(mapping -> !expectedPorts.contains(mapping.servePort()))
                .map(mapping -> new AccessModels.PrivateAccessStaleMapping(
                        mapping.serviceName() == null || mapping.serviceName().isBlank()
                                ? "port-" + mapping.servePort()
                                : mapping.serviceName() + "-" + mapping.servePort(),
                        mapping.serviceName(),
                        mapping.endpoint(),
                        mapping.servePort(),
                        mapping.target(),
                        mapping.targetPort(),
                        "Unassigned private link found",
                        "No managed app currently expects this endpoint. Its ownership cannot be confirmed, so Autark-OS leaves it unchanged. Review it in Tailscale diagnostics.",
                        null))
                .toList();
    }

    private List<AppRuntimeView> runtimeApps() {
        return ApplicationViews.managedRuntimes(applicationStateService.snapshot());
    }
}

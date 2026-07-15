package com.autarkos.marketplace.install;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.apps.ApplicationStateService;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.models.AccessModels;
import com.autarkos.network.tailscale.TailscaleServeConfig;
import com.autarkos.network.tailscale.TailscaleServeMapping;
import com.autarkos.network.tailscale.TailscaleServeResult;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.network.tailscale.TailscaleStatus;

@Service
public class PrivateAccessReconciliationService {

    private final Supplier<List<AppRuntimeView>> runtimeApps;
    private final MarketplaceCatalogService catalogService;
    private final TailscaleService tailscaleService;
    private final PrivateAccessStateResolver stateResolver;

    @Autowired
    public PrivateAccessReconciliationService(ApplicationStateService applicationStateService, MarketplaceCatalogService catalogService, TailscaleService tailscaleService, InstalledAppRepository repository) {
        this(() -> applicationStateService.snapshot().runtimeApps(), catalogService, tailscaleService, repository);
    }

    public PrivateAccessReconciliationService(AppLifecycleService appLifecycleService, MarketplaceCatalogService catalogService, TailscaleService tailscaleService) {
        this(appLifecycleService::listApps, catalogService, tailscaleService, null);
    }

    private PrivateAccessReconciliationService(Supplier<List<AppRuntimeView>> runtimeApps, MarketplaceCatalogService catalogService, TailscaleService tailscaleService, InstalledAppRepository repository) {
        this.runtimeApps = runtimeApps;
        this.catalogService = catalogService;
        this.tailscaleService = tailscaleService;
        this.stateResolver = new PrivateAccessStateResolver(repository, tailscaleService);
    }

    public AccessModels.PrivateAccessReconciliationReport report() {
        TailscaleStatus status = tailscaleService.status();
        List<AppRuntimeView> privateApps = runtimeApps.get().stream()
                .filter(this::wantsPrivateAccess)
                .toList();
        if (privateApps.isEmpty()) {
            return new AccessModels.PrivateAccessReconciliationReport(
                    "healthy",
                    "No private app links to verify",
                    "Apps will appear here after private access is enabled.",
                    List.of(),
                    List.of(),
                    Instant.now());
        }
        if (!status.installed()) {
            return unavailableReport("warning", "Install Tailscale to verify private links", "Autark-OS cannot inspect private app links until Tailscale is installed.", privateApps, status);
        }
        if (!status.connected()) {
            return unavailableReport("warning", "Connect Tailscale to verify private links", "Autark-OS cannot inspect private app links until this device is connected.", privateApps, status);
        }

        TailscaleServeConfig config = tailscaleService.serveConfig();
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
                        + (staleMappings.isEmpty() ? "" : " " + staleMappings.size() + " stale mapping(s) may be left over."),
                items,
                staleMappings,
                Instant.now());
    }

    public TailscaleServeResult removeStaleMapping(int httpsPort) {
        if (httpsPort < 1 || httpsPort > 65535) {
            throw new InstallationException("Private access port must be between 1 and 65535.");
        }
        if (!knownAutarkOsPorts().contains(httpsPort)) {
            throw new InstallationException("Autark-OS does not recognize this as one of its managed app ports.");
        }
        TailscaleStatus tailscale = tailscaleService.status();
        TailscaleServeConfig config = tailscale.connected()
                ? tailscaleService.serveConfig()
                : TailscaleServeConfig.unavailable("not_connected", "Tailscale is not connected.", List.of());
        boolean appStillExpectsPort = runtimeApps.get().stream()
                .filter(this::wantsPrivateAccess)
                .map(app -> stateResolver.resolve(app.appId(), app.settings(), app.accessUrl(), tailscale, config).expectedHttpsPort())
                .filter(Objects::nonNull)
                .anyMatch(port -> port == httpsPort);
        if (appStillExpectsPort) {
            throw new InstallationException("This private link still belongs to an installed app. Use Repair or turn private access off from the app instead.");
        }
        TailscaleServeResult result = tailscaleService.disableHttps(httpsPort);
        if (!result.configured()) {
            throw new InstallationException(result.message());
        }
        return result;
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
        Set<Integer> autarkOsPorts = knownAutarkOsPorts();
        return config.mappings().stream()
                .filter(mapping -> mapping.servePort() != null)
                .filter(mapping -> autarkOsPorts.contains(mapping.servePort()))
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
                        "Stale private link found",
                        "Tailscale Serve still has an HTTPS link on port " + mapping.servePort() + ", but no installed app currently expects it.",
                        "Remove stale link"))
                .toList();
    }

    private Set<Integer> knownAutarkOsPorts() {
        List<AppRuntimeView> apps = runtimeApps.get();
        Set<Integer> ports = apps.stream()
                .map(app -> app.observedAccess() == null ? null : app.observedAccess().localPort())
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        apps.stream()
                .map(this::storedPrivateUrl)
                .map(this::portFromUrl)
                .filter(Objects::nonNull)
                .forEach(ports::add);
        catalogService.findAll().stream()
                .map(manifest -> portFromUrl(manifest.accessUrl()))
                .filter(Objects::nonNull)
                .forEach(ports::add);
        catalogService.findAll().forEach(manifest -> {
            Integer localPort = portFromUrl(manifest.accessUrl());
            if (localPort != null) {
                ports.add(AppPrivateAccessPorts.defaultHttpsPort(manifest.id(), localPort));
            }
        });
        return ports;
    }

    private Integer portFromUrl(String url) {
        if (url == null || url.isBlank()) {
            return null;
        }
        try {
            java.net.URI uri = java.net.URI.create(url);
            if (uri.getPort() > 0) {
                return uri.getPort();
            }
            if ("http".equalsIgnoreCase(uri.getScheme())) {
                return 80;
            }
            if ("https".equalsIgnoreCase(uri.getScheme())) {
                return 443;
            }
        } catch (IllegalArgumentException ignored) {
            return null;
        }
        return null;
    }
}

package com.projectos.marketplace.install;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.projectos.apps.ApplicationStateService;
import com.projectos.marketplace.catalog.MarketplaceCatalogService;
import com.projectos.network.tailscale.TailscaleServeConfig;
import com.projectos.network.tailscale.TailscaleServeMapping;
import com.projectos.network.tailscale.TailscaleServeResult;
import com.projectos.network.tailscale.TailscaleService;
import com.projectos.network.tailscale.TailscaleStatus;

@Service
public class PrivateAccessReconciliationService {

    private final Supplier<List<AppRuntimeView>> runtimeApps;
    private final MarketplaceCatalogService catalogService;
    private final TailscaleService tailscaleService;

    @Autowired
    public PrivateAccessReconciliationService(ApplicationStateService applicationStateService, MarketplaceCatalogService catalogService, TailscaleService tailscaleService) {
        this(() -> applicationStateService.snapshot().runtimeApps(), catalogService, tailscaleService);
    }

    public PrivateAccessReconciliationService(AppLifecycleService appLifecycleService, MarketplaceCatalogService catalogService, TailscaleService tailscaleService) {
        this(appLifecycleService::listApps, catalogService, tailscaleService);
    }

    private PrivateAccessReconciliationService(Supplier<List<AppRuntimeView>> runtimeApps, MarketplaceCatalogService catalogService, TailscaleService tailscaleService) {
        this.runtimeApps = runtimeApps;
        this.catalogService = catalogService;
        this.tailscaleService = tailscaleService;
    }

    public PrivateAccessReconciliationReport report() {
        TailscaleStatus status = tailscaleService.status();
        List<AppRuntimeView> privateApps = runtimeApps.get().stream()
                .filter(this::wantsPrivateAccess)
                .toList();
        if (privateApps.isEmpty()) {
            return new PrivateAccessReconciliationReport(
                    "healthy",
                    "No private app links to verify",
                    "Apps will appear here after private access is enabled.",
                    List.of(),
                    List.of(),
                    Instant.now());
        }
        if (!status.installed()) {
            return unavailableReport("warning", "Install Tailscale to verify private links", "Autark-OS cannot inspect private app links until Tailscale is installed.", privateApps, "Install Tailscale");
        }
        if (!status.connected()) {
            return unavailableReport("warning", "Connect Tailscale to verify private links", "Autark-OS cannot inspect private app links until this device is connected.", privateApps, "Connect this device");
        }

        TailscaleServeConfig config = tailscaleService.serveConfig();
        List<PrivateAccessReconciliationItem> items = privateApps.stream()
                .map(app -> reconcile(app, config))
                .toList();
        List<PrivateAccessStaleMapping> staleMappings = staleMappings(privateApps, config);
        boolean warning = items.stream().anyMatch(item -> !"healthy".equals(item.status())) || !staleMappings.isEmpty();
        long healthy = items.stream().filter(item -> "healthy".equals(item.status())).count();
        return new PrivateAccessReconciliationReport(
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
        if (!knownProjectOsPorts().contains(httpsPort)) {
            throw new InstallationException("Autark-OS does not recognize this as one of its managed app ports.");
        }
        boolean appStillExpectsPort = runtimeApps.get().stream()
                .filter(this::wantsPrivateAccess)
                .map(this::expectedPort)
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

    private PrivateAccessReconciliationReport unavailableReport(String status, String headline, String summary, List<AppRuntimeView> apps, String actionLabel) {
        List<PrivateAccessReconciliationItem> items = apps.stream()
                .map(app -> new PrivateAccessReconciliationItem(
                        app.appId(),
                        app.appName(),
                        "waiting",
                        "Waiting for Tailscale",
                        "Autark-OS will verify this private link after Tailscale is ready.",
                        actionLabel,
                        expectedPrivateUrl(app),
                        null,
                        expectedPort(app),
                        null,
                        null,
                        expectedPort(app),
                        expectedHttpsPort(expectedPrivateUrl(app), expectedPort(app)),
                        storedPrivateUrl(app),
                        desiredMapping(expectedHttpsPort(expectedPrivateUrl(app), expectedPort(app)), expectedPort(app)),
                        List.of(),
                        "Tailscale is not ready, so live Serve mappings were not inspected.",
                        null))
                .toList();
        return new PrivateAccessReconciliationReport(status, headline, summary, items, List.of(), Instant.now());
    }

    private PrivateAccessReconciliationItem reconcile(AppRuntimeView app, TailscaleServeConfig config) {
        Integer expectedPort = expectedPort(app);
        String expectedUrl = expectedPrivateUrl(app);
        Integer expectedHttpsPort = expectedHttpsPort(expectedUrl, expectedPort);
        String desiredMapping = desiredMapping(expectedHttpsPort, expectedPort);
        List<String> liveMappings = liveMappings(config);
        if (expectedPort == null) {
            return item(app, "missing", "No local port found", "Start or repair the app so Autark-OS can find the local browser port.", "Repair app link", expectedUrl, null, null, null, expectedHttpsPort, desiredMapping, liveMappings, "No local published port was available for this app.");
        }
        if (!config.available()) {
            return item(app, "unknown", "Private link could not be verified", config.message(), "Retry check", expectedUrl, expectedPort, null, null, expectedHttpsPort, desiredMapping, liveMappings, config.message());
        }
        if ("dev_mock".equals(config.status())) {
            return item(app, "healthy", "Private link verified in dev mode", "Dev mode is treating this private link as reachable without changing Tailscale Serve.", null, expectedUrl, expectedPort, expectedHttpsPort, "http://127.0.0.1:" + expectedPort, expectedHttpsPort, desiredMapping, liveMappings, "Dev mode bypassed live Tailscale Serve inspection.");
        }
        Optional<TailscaleServeMapping> endpointMatch = config.mappings().stream()
                .filter(mapping -> matchesExpectedMapping(mapping, expectedPort, expectedHttpsPort, expectedUrl))
                .findFirst();
        if (endpointMatch.isEmpty()) {
            Optional<TailscaleServeMapping> wrongTargetForEndpoint = config.mappings().stream()
                    .filter(mapping -> endpointMatches(mapping, expectedHttpsPort, expectedUrl))
                    .findFirst();
            if (wrongTargetForEndpoint.isPresent()) {
                TailscaleServeMapping mapping = wrongTargetForEndpoint.get();
                return item(app, "mismatched", "Private link points to a different local port", "Expected local port " + expectedPort + ", but Tailscale Serve points to " + friendlyPort(mapping.targetPort()) + ".", "Repair private link", expectedUrl, expectedPort, mapping.servePort(), mapping.target(), expectedHttpsPort, desiredMapping, liveMappings, "HTTPS endpoint matched, but the target local port did not.");
            }
            boolean localPortMappedElsewhere = config.mappings().stream().anyMatch(mapping -> Objects.equals(mapping.targetPort(), expectedPort));
            String detail = localPortMappedElsewhere
                    ? "Tailscale Serve routes to this app's local port, but not from the expected private HTTPS endpoint."
                    : "Tailscale Serve does not currently expose this app's expected local port.";
            return item(app, localPortMappedElsewhere ? "mismatched" : "missing", localPortMappedElsewhere ? "Private link uses a different HTTPS endpoint" : "Private link is missing", detail, "Repair private link", expectedUrl, expectedPort, null, null, expectedHttpsPort, desiredMapping, liveMappings, localPortMappedElsewhere ? "A live mapping targets the app port, but the private URL endpoint does not match." : "No live mapping targets the app port.");
        }
        TailscaleServeMapping mapping = endpointMatch.get();
        if (!Objects.equals(mapping.targetPort(), expectedPort)) {
            return item(app, "mismatched", "Private link points to a different local port", "Expected local port " + expectedPort + ", but Tailscale Serve points to " + friendlyPort(mapping.targetPort()) + ".", "Repair private link", expectedUrl, expectedPort, mapping.servePort(), mapping.target(), expectedHttpsPort, desiredMapping, liveMappings, "HTTPS endpoint matched, but the target local port did not.");
        }
        return item(app, "healthy", "Private link verified", "Tailscale Serve is routing this private link to the expected local app port.", null, expectedUrl, expectedPort, mapping.servePort(), mapping.target(), expectedHttpsPort, desiredMapping, liveMappings, "Live Serve mapping matches the expected local app port and private endpoint.");
    }

    private PrivateAccessReconciliationItem item(AppRuntimeView app, String status, String message, String detail, String actionLabel, String expectedPrivateUrl, Integer expectedPort, Integer actualPort, String target, Integer expectedHttpsPort, String desiredMapping, List<String> liveMappings, String matchReason) {
        return new PrivateAccessReconciliationItem(
                app.appId(),
                app.appName(),
                status,
                message,
                detail,
                actionLabel,
                expectedPrivateUrl,
                actualPrivateUrl(app),
                expectedPort,
                actualPort,
                target,
                expectedPort,
                expectedHttpsPort,
                storedPrivateUrl(app),
                desiredMapping,
                liveMappings,
                matchReason,
                "healthy".equals(status) ? Instant.now() : null);
    }

    private boolean wantsPrivateAccess(AppRuntimeView app) {
        if (app.settings() != null && app.settings().tailscaleEnabled()) {
            return true;
        }
        return app.desiredAccess() != null
                && ("private".equals(app.desiredAccess().mode()) || "local-and-private".equals(app.desiredAccess().mode()) || app.desiredAccess().privateAccessRequired());
    }

    private String expectedPrivateUrl(AppRuntimeView app) {
        if (app.desiredAccess() != null && app.desiredAccess().privateUrl() != null && !app.desiredAccess().privateUrl().isBlank()) {
            return app.desiredAccess().privateUrl();
        }
        if (app.settings() != null) {
            return app.settings().privateAccessUrl();
        }
        return null;
    }

    private String actualPrivateUrl(AppRuntimeView app) {
        return app.observedAccess() == null ? null : app.observedAccess().privateUrl();
    }

    private String storedPrivateUrl(AppRuntimeView app) {
        return app.settings() == null ? null : app.settings().privateAccessUrl();
    }

    private Integer expectedPort(AppRuntimeView app) {
        if (app.observedAccess() != null && app.observedAccess().localPort() != null) {
            return app.observedAccess().localPort();
        }
        if (app.desiredAccess() != null && app.desiredAccess().expectedLocalPort() != null) {
            return app.desiredAccess().expectedLocalPort();
        }
        return portFromUrl(app.accessUrl());
    }

    private Integer expectedHttpsPort(String privateUrl, Integer expectedLocalPort) {
        Integer privateUrlPort = portFromUrl(privateUrl);
        return privateUrlPort == null ? expectedLocalPort : privateUrlPort;
    }

    private String desiredMapping(Integer expectedHttpsPort, Integer expectedLocalPort) {
        String https = expectedHttpsPort == null ? "unknown HTTPS endpoint" : "https:" + expectedHttpsPort;
        String local = expectedLocalPort == null ? "unknown local app port" : "127.0.0.1:" + expectedLocalPort;
        return https + " -> " + local;
    }

    private List<String> liveMappings(TailscaleServeConfig config) {
        if (!config.available()) {
            return List.of();
        }
        return config.mappings().stream()
                .map(mapping -> "https:" + friendlyPort(mapping.servePort()) + " -> " + firstPresent(mapping.target(), "unknown target"))
                .toList();
    }

    private boolean matchesExpectedMapping(TailscaleServeMapping mapping, Integer expectedLocalPort, Integer expectedHttpsPort, String expectedPrivateUrl) {
        if (!Objects.equals(mapping.targetPort(), expectedLocalPort)) {
            return false;
        }
        return endpointMatches(mapping, expectedHttpsPort, expectedPrivateUrl);
    }

    private boolean endpointMatches(TailscaleServeMapping mapping, Integer expectedHttpsPort, String expectedPrivateUrl) {
        if (expectedHttpsPort == null) {
            return true;
        }
        if (Objects.equals(mapping.servePort(), expectedHttpsPort)) {
            return true;
        }
        return expectedHttpsPort == 443 && mapping.servePort() == null && endpointHostMatches(mapping.endpoint(), expectedPrivateUrl);
    }

    private boolean endpointHostMatches(String endpoint, String expectedPrivateUrl) {
        String endpointHost = host(endpoint);
        String expectedHost = host(expectedPrivateUrl);
        return endpointHost != null && expectedHost != null && endpointHost.equals(expectedHost);
    }

    private String host(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            String normalized = value.contains("://") ? value : "https://" + value;
            String host = java.net.URI.create(normalized).getHost();
            return host == null ? null : host.toLowerCase().replaceAll("\\.$", "");
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private String friendlyPort(Integer port) {
        return port == null ? "unknown" : String.valueOf(port);
    }

    private String firstPresent(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private List<PrivateAccessStaleMapping> staleMappings(List<AppRuntimeView> privateApps, TailscaleServeConfig config) {
        if (!config.available() || "dev_mock".equals(config.status())) {
            return List.of();
        }
        Set<Integer> expectedPorts = privateApps.stream()
                .map(this::expectedPort)
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        Set<Integer> projectOsPorts = knownProjectOsPorts();
        return config.mappings().stream()
                .filter(mapping -> mapping.servePort() != null)
                .filter(mapping -> projectOsPorts.contains(mapping.servePort()))
                .filter(mapping -> !expectedPorts.contains(mapping.servePort()))
                .map(mapping -> new PrivateAccessStaleMapping(
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

    private Set<Integer> knownProjectOsPorts() {
        Set<Integer> ports = runtimeApps.get().stream()
                .map(app -> app.observedAccess() == null ? null : app.observedAccess().localPort())
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        catalogService.findAll().stream()
                .map(manifest -> portFromUrl(manifest.accessUrl()))
                .filter(Objects::nonNull)
                .forEach(ports::add);
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

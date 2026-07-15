package com.autarkos.marketplace.install;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.network.tailscale.TailscaleServeConfig;
import com.autarkos.network.tailscale.TailscaleServeMapping;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.network.tailscale.TailscaleStatus;

/**
 * Interprets the requested app access settings and the live Tailscale Serve
 * snapshot once so every backend surface reports the same private-link state.
 */
final class PrivateAccessStateResolver {

    private final InstalledAppRepository repository;
    private final TailscaleService tailscaleService;

    PrivateAccessStateResolver(InstalledAppRepository repository, TailscaleService tailscaleService) {
        this.repository = repository;
        this.tailscaleService = tailscaleService;
    }

    PrivateAccessState resolve(String appId, InstallModels.InstallSettings settings, String accessUrl) {
        TailscaleStatus tailscale = tailscaleService.status();
        TailscaleServeConfig config = tailscale.connected()
                ? tailscaleService.serveConfig()
                : TailscaleServeConfig.unavailable("not_connected", "Tailscale is not connected.", List.of());
        return resolve(appId, settings, accessUrl, tailscale, config);
    }

    PrivateAccessState resolve(
            String appId,
            InstallModels.InstallSettings settings,
            String accessUrl,
            TailscaleStatus tailscale,
            TailscaleServeConfig config) {
        boolean requested = wantsPrivateAccess(settings);
        Integer localPort = expectedLocalPort(settings, accessUrl);
        if (!requested) {
            return state(false, "not_enabled", "Private access is off", "This app uses its local link.", null, null, null, localPort, null, null, config, "Private access is not requested.", null);
        }
        if (localPort == null) {
            return state(true, "missing", "No local port found", "Start or repair the app so Autark-OS can find its local browser port.", "Repair app link", null, null, null, null, null, config, "No local published port was available for this app.", null);
        }

        Integer storedHttpsPort = AppPrivateAccessPorts.portFromUrl(settings == null ? null : settings.privateAccessUrl());
        int httpsPort = storedHttpsPort == null
                ? AppPrivateAccessPorts.selectHttpsPort(appId, localPort, repository)
                : storedHttpsPort;
        String expectedUrl = tailscaleService.privateUrlForPort(tailscale, httpsPort);
        if (!tailscale.installed()) {
            return state(true, "waiting", "Waiting for Tailscale", "Install Tailscale to create and verify this private link.", "Install Tailscale", expectedUrl, null, localPort, httpsPort, null, config, "Tailscale is not installed.", null);
        }
        if (!tailscale.connected()) {
            return state(true, "waiting", "Waiting for Tailscale", "Connect this server to Tailscale to create and verify this private link.", "Connect this device", expectedUrl, null, localPort, httpsPort, null, config, "Tailscale is not connected.", null);
        }
        if (expectedUrl == null || expectedUrl.isBlank()) {
            return state(true, "waiting", "Private DNS is not ready", "Enable MagicDNS and HTTPS certificates before creating this link.", "Check Tailscale DNS", null, null, localPort, httpsPort, null, config, "The connected Tailscale node has no DNS name.", null);
        }
        if (httpsPort == localPort) {
            return state(true, "port_conflict", "Private link uses the local app port", "Repair the link so Autark-OS can assign a separate private HTTPS port.", "Repair private link", expectedUrl, null, localPort, httpsPort, null, config, "The private HTTPS port conflicts with the local HTTP port.", null);
        }
        if (!config.available()) {
            return state(true, "unknown", "Private link could not be verified", config.message(), "Retry check", expectedUrl, null, localPort, httpsPort, null, config, config.message(), null);
        }
        if ("dev_mock".equals(config.status())) {
            return state(true, "verified", "Private link verified in dev mode", "Development mode is simulating the expected Serve mapping.", null, expectedUrl, expectedUrl, localPort, httpsPort, null, config, "Development mode bypassed live Tailscale Serve inspection.", Instant.now());
        }

        TailscaleServeMapping exact = config.mappings().stream()
                .filter(mapping -> servePortMatches(mapping, httpsPort, expectedUrl))
                .filter(mapping -> Objects.equals(mapping.targetPort(), localPort))
                .findFirst()
                .orElse(null);
        if (exact != null) {
            return state(true, "verified", "Private link verified", "Tailscale Serve routes this private HTTPS link to the expected local app port.", null, expectedUrl, expectedUrl, localPort, httpsPort, exact, config, "The live Serve mapping matches the expected local app port and HTTPS endpoint.", Instant.now());
        }

        TailscaleServeMapping endpoint = config.mappings().stream()
                .filter(mapping -> servePortMatches(mapping, httpsPort, expectedUrl))
                .findFirst()
                .orElse(null);
        if (endpoint != null) {
            return state(true, "mismatched", "Private link points to a different local port", "Expected local port " + localPort + ", but Tailscale Serve points to " + friendlyPort(endpoint.targetPort()) + ".", "Repair private link", expectedUrl, null, localPort, httpsPort, endpoint, config, "The HTTPS endpoint exists, but its target local port does not match.", null);
        }

        TailscaleServeMapping targetElsewhere = config.mappings().stream()
                .filter(mapping -> Objects.equals(mapping.targetPort(), localPort))
                .findFirst()
                .orElse(null);
        if (targetElsewhere != null) {
            return state(true, "mismatched", "Private link uses a different HTTPS endpoint", "Tailscale Serve reaches this app, but not through the expected private HTTPS port.", "Repair private link", expectedUrl, null, localPort, httpsPort, targetElsewhere, config, "A live mapping targets the app port, but its HTTPS endpoint does not match.", null);
        }
        return state(true, "missing", "Private link is missing", "Tailscale Serve does not currently expose this app's expected local port.", "Repair private link", expectedUrl, null, localPort, httpsPort, null, config, "No live mapping targets the expected app port and HTTPS endpoint.", null);
    }

    private PrivateAccessState state(
            boolean requested,
            String status,
            String message,
            String detail,
            String actionLabel,
            String expectedPrivateUrl,
            String verifiedPrivateUrl,
            Integer expectedLocalPort,
            Integer expectedHttpsPort,
            TailscaleServeMapping mapping,
            TailscaleServeConfig config,
            String matchReason,
            Instant verifiedAt) {
        List<String> liveMappings = config == null || !config.available()
                ? List.of()
                : config.mappings().stream()
                        .map(item -> "https:" + friendlyPort(item.servePort()) + " -> " + firstPresent(item.target(), "unknown target"))
                        .toList();
        return new PrivateAccessState(
                requested,
                status,
                message,
                detail,
                actionLabel,
                expectedPrivateUrl,
                verifiedPrivateUrl,
                expectedLocalPort,
                expectedHttpsPort,
                mapping,
                liveMappings,
                matchReason,
                verifiedAt);
    }

    private boolean wantsPrivateAccess(InstallModels.InstallSettings settings) {
        if (settings == null) {
            return false;
        }
        return settings.tailscaleEnabled()
                || "private".equals(settings.desiredAccessMode())
                || "local-and-private".equals(settings.desiredAccessMode())
                || "required".equals(settings.privateAccessRequirement());
    }

    private Integer expectedLocalPort(InstallModels.InstallSettings settings, String accessUrl) {
        if (settings != null && settings.expectedLocalPort() != null) {
            return settings.expectedLocalPort();
        }
        return AppPrivateAccessPorts.portFromUrl(firstPresent(accessUrl, settings == null ? null : settings.accessUrl()));
    }

    private String friendlyPort(Integer port) {
        return port == null ? "unknown" : String.valueOf(port);
    }

    private boolean servePortMatches(TailscaleServeMapping mapping, Integer expectedPort, String expectedUrl) {
        if (Objects.equals(mapping.servePort(), expectedPort)) {
            return true;
        }
        if (!Objects.equals(expectedPort, 443) || mapping.servePort() != null) {
            return false;
        }
        return Objects.equals(host(mapping.endpoint()), host(expectedUrl));
    }

    private String host(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            String normalized = value.contains("://") ? value : "https://" + value;
            String host = java.net.URI.create(normalized).getHost();
            return host == null ? null : host.toLowerCase().replaceAll("\\.$", "");
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private String firstPresent(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}

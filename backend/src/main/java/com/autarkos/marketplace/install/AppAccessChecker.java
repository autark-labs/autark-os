package com.autarkos.marketplace.install;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Set;

import com.autarkos.marketplace.install.models.AccessModels;
import com.autarkos.marketplace.model.AccessManifest;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.model.HealthManifest;

class AppAccessChecker {

    static final Duration ACCESS_CHECK_TIMEOUT = Duration.ofMillis(850);

    private final boolean devMode;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(ACCESS_CHECK_TIMEOUT)
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    AppAccessChecker(boolean devMode) {
        this.devMode = devMode;
    }

    boolean shouldCheckLocalAccess(ApplicationManifest manifest, String accessUrl) {
        if (accessUrl == null || accessUrl.isBlank()) {
            return false;
        }
        HealthManifest health = healthContract(manifest);
        if (Set.of("container", "no-web-ui", "none").contains(health.type())) {
            return false;
        }
        String kind = manifest == null || manifest.access() == null ? "" : manifest.access().kind();
        return kind == null || !kind.equals("background");
    }

    HealthManifest healthContract(ApplicationManifest manifest) {
        if (manifest == null || manifest.health() == null) {
            return HealthManifest.defaults(AccessManifest.defaults(), com.autarkos.marketplace.model.UsageManifest.defaults());
        }
        return manifest.health();
    }

    AccessModels.AppAccessCheck localHealthCheck(String appId, ApplicationManifest manifest, String accessUrl) {
        HealthManifest health = healthContract(manifest);
        if ("tcp".equals(health.type())) {
            return tcpAccessCheck(appId, accessUrl);
        }
        return accessCheck(appId, accessUrl);
    }

    AccessModels.AppAccessCheck accessCheck(String appId, String accessUrl) {
        if (accessUrl == null || accessUrl.isBlank()) {
            return AccessModels.AppAccessCheck.notConfigured(appId);
        }
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(accessUrl))
                    .timeout(ACCESS_CHECK_TIMEOUT)
                    .method("HEAD", HttpRequest.BodyPublishers.noBody())
                    .build();
            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() >= 200 && response.statusCode() < 500) {
                return AccessModels.AppAccessCheck.reachable(appId, accessUrl);
            }
            return AccessModels.AppAccessCheck.unreachable(appId, accessUrl);
        } catch (IllegalArgumentException | IOException exception) {
            return AccessModels.AppAccessCheck.unreachable(appId, accessUrl);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return AccessModels.AppAccessCheck.unreachable(appId, accessUrl);
        }
    }

    AccessModels.AppAccessCheck privateAccessCheck(String appId, String privateAccessUrl) {
        if (privateAccessUrl == null || privateAccessUrl.isBlank()) {
            return AccessModels.AppAccessCheck.notConfigured(appId);
        }
        if (devMode) {
            return AccessModels.AppAccessCheck.reachable(appId, privateAccessUrl);
        }
        return accessCheck(appId, privateAccessUrl);
    }

    private AccessModels.AppAccessCheck tcpAccessCheck(String appId, String accessUrl) {
        if (accessUrl == null || accessUrl.isBlank()) {
            return AccessModels.AppAccessCheck.notConfigured(appId);
        }
        try {
            URI uri = URI.create(accessUrl);
            int port = uri.getPort();
            if (port < 1) {
                port = "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
            }
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(uri.getHost(), port), (int) ACCESS_CHECK_TIMEOUT.toMillis());
                return AccessModels.AppAccessCheck.reachable(appId, accessUrl);
            }
        } catch (IllegalArgumentException | IOException exception) {
            return AccessModels.AppAccessCheck.unreachable(appId, accessUrl);
        }
    }
}

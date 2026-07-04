package com.autarkos.pro;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;

import com.autarkos.pro.models.ProRemoteModels;
import com.fasterxml.jackson.databind.ObjectMapper;

public class SupabaseProRemoteClient implements ProRemoteClient {

    private static final String REMOTE_FAILURE = "Autark Pro could not reach the remote service. Local Autark-OS features are still available.";

    private final URI apiBaseUri;
    private final int heartbeatTimeoutSeconds;
    private final int feedTimeoutSeconds;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public SupabaseProRemoteClient(String apiBaseUrl, int heartbeatTimeoutSeconds, int feedTimeoutSeconds) {
        this.apiBaseUri = URI.create(requireBaseUrl(apiBaseUrl));
        this.heartbeatTimeoutSeconds = Math.max(1, heartbeatTimeoutSeconds);
        this.feedTimeoutSeconds = Math.max(1, feedTimeoutSeconds);
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(Math.min(this.heartbeatTimeoutSeconds, this.feedTimeoutSeconds)))
                .build();
        this.objectMapper = new ObjectMapper().findAndRegisterModules();
    }

    @Override
    public ProRemoteModels.RegisterInstallResponse registerInstall(ProRemoteModels.RegisterInstallRequest request) {
        return post("/register-install", request, ProRemoteModels.RegisterInstallResponse.class, heartbeatTimeoutSeconds);
    }

    @Override
    public ProRemoteModels.RedeemLicenseResponse redeemLicense(ProRemoteModels.RedeemLicenseRequest request) {
        return post("/redeem-license", request, ProRemoteModels.RedeemLicenseResponse.class, heartbeatTimeoutSeconds);
    }

    @Override
    public ProRemoteModels.HeartbeatResponse submitHeartbeat(ProRemoteModels.HeartbeatRequest request) {
        return post("/submit-heartbeat", request, ProRemoteModels.HeartbeatResponse.class, heartbeatTimeoutSeconds);
    }

    @Override
    public ProRemoteModels.ProFeedResponse proFeed(Instant since) {
        String query = since == null ? "" : "?since=" + URLEncoder.encode(since.toString(), StandardCharsets.UTF_8);
        HttpRequest request = HttpRequest.newBuilder(resolve("/pro-feed" + query))
                .GET()
                .timeout(Duration.ofSeconds(feedTimeoutSeconds))
                .header("Accept", "application/json")
                .build();
        return send(request, ProRemoteModels.ProFeedResponse.class);
    }

    private <T> T post(String path, Object requestBody, Class<T> responseType, int timeoutSeconds) {
        try {
            String body = objectMapper.writeValueAsString(requestBody);
            HttpRequest request = HttpRequest.newBuilder(resolve(path))
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .timeout(Duration.ofSeconds(Math.max(1, timeoutSeconds)))
                    .header("Accept", "application/json")
                    .header("Content-Type", "application/json")
                    .build();
            return send(request, responseType);
        } catch (IOException exception) {
            throw new ProRemoteException(REMOTE_FAILURE, exception);
        }
    }

    private <T> T send(HttpRequest request, Class<T> responseType) {
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ProRemoteException(REMOTE_FAILURE);
            }
            return objectMapper.readValue(response.body(), responseType);
        } catch (IOException exception) {
            throw new ProRemoteException(REMOTE_FAILURE, exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ProRemoteException("Autark Pro remote request was interrupted. Try again when the local system is idle.", exception);
        }
    }

    private URI resolve(String path) {
        String base = apiBaseUri.toString();
        String normalizedBase = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
        return URI.create(normalizedBase + path);
    }

    private static String requireBaseUrl(String apiBaseUrl) {
        if (apiBaseUrl == null || apiBaseUrl.isBlank()) {
            throw new IllegalArgumentException("Autark Pro API base URL is required for the remote client.");
        }
        return apiBaseUrl.trim();
    }
}

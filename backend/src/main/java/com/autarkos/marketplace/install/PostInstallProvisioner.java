package com.autarkos.marketplace.install;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.autarkos.marketplace.model.ApplicationManifest;

@Component
public class PostInstallProvisioner {

    private static final String OBSIDIAN_DATABASE = "obsidian";

    private final HttpClient httpClient;

    public PostInstallProvisioner() {
        this(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(2))
                .build());
    }

    PostInstallProvisioner(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    public GuideModels.PostInstallProvisioningResult provision(ApplicationManifest manifest, String accessUrl) {
        if ("obsidian-livesync".equals(manifest.id())) {
            return provisionObsidianLiveSync(manifest, accessUrl);
        }
        return GuideModels.PostInstallProvisioningResult.empty();
    }

    private GuideModels.PostInstallProvisioningResult provisionObsidianLiveSync(ApplicationManifest manifest, String accessUrl) {
        Map<String, String> environment = environment(manifest);
        String username = environment.getOrDefault("COUCHDB_USER", "autarkos");
        String password = environment.getOrDefault("COUCHDB_PASSWORD", "");
        List<String> logs = new ArrayList<>();
        List<InstallModels.InstallStep> steps = new ArrayList<>();

        if (password.isBlank()) {
            String detail = "CouchDB credentials were not available, so Autark-OS could not finish Obsidian LiveSync setup.";
            steps.add(InstallModels.InstallStep.failed("Preparing Obsidian sync", detail));
            return new GuideModels.PostInstallProvisioningResult(steps, logs, Map.of(
                    "username", username,
                    "database", OBSIDIAN_DATABASE));
        }

        waitForCouchDb(accessUrl, username, password, logs);
        enableSingleNode(accessUrl, username, password, logs);
        putConfig(accessUrl, username, password, "chttpd", "require_valid_user", "true", logs);
        putConfig(accessUrl, username, password, "chttpd_auth", "require_valid_user", "true", logs);
        putConfig(accessUrl, username, password, "httpd", "WWW-Authenticate", "Basic realm=\\\"couchdb\\\"", logs);
        putConfig(accessUrl, username, password, "httpd", "enable_cors", "true", logs);
        putConfig(accessUrl, username, password, "chttpd", "enable_cors", "true", logs);
        putConfig(accessUrl, username, password, "chttpd", "max_http_request_size", "4294967296", logs);
        putConfig(accessUrl, username, password, "couchdb", "max_document_size", "50000000", logs);
        putConfig(accessUrl, username, password, "cors", "credentials", "true", logs);
        putConfig(accessUrl, username, password, "cors", "origins", "app://obsidian.md,capacitor://localhost,http://localhost", logs);
        putConfig(accessUrl, username, password, "cors", "methods", "GET, PUT, POST, HEAD, DELETE", logs);
        putConfig(accessUrl, username, password, "cors", "headers", "accept, authorization, content-type, origin, referer", logs);
        createDatabase(accessUrl, username, password, OBSIDIAN_DATABASE, logs);

        steps.add(InstallModels.InstallStep.completed("Preparing Obsidian sync", "Created the sync database and enabled browser access for the Obsidian plugin."));
        Map<String, String> values = new LinkedHashMap<>();
        values.put("username", username);
        values.put("password", password);
        values.put("database", OBSIDIAN_DATABASE);
        return new GuideModels.PostInstallProvisioningResult(steps, logs, values);
    }

    private void waitForCouchDb(String accessUrl, String username, String password, List<String> logs) {
        RuntimeException lastException = null;
        for (int attempt = 1; attempt <= 12; attempt++) {
            try {
                HttpResponse<String> response = send(accessUrl + "/", username, password, "GET", null);
                logs.add("CouchDB readiness check returned HTTP " + response.statusCode());
                if (response.statusCode() >= 200 && response.statusCode() < 500) {
                    return;
                }
            } catch (RuntimeException exception) {
                lastException = exception;
                logs.add("Waiting for CouchDB HTTP endpoint: " + exception.getMessage());
            }
            sleep();
        }
        throw new InstallationException("CouchDB started but did not become reachable for setup.", lastException);
    }

    private void enableSingleNode(String accessUrl, String username, String password, List<String> logs) {
        String body = """
                {"action":"enable_single_node","username":"%s","password":"%s","bind_address":"0.0.0.0","port":5984,"singlenode":true}
                """.formatted(json(username), json(password));
        HttpResponse<String> response = send(accessUrl + "/_cluster_setup", username, password, "POST", body);
        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            logs.add("Configured CouchDB single-node mode");
            return;
        }
        if (response.statusCode() == 400 && response.body() != null && response.body().contains("single_node_enabled")) {
            logs.add("CouchDB single-node mode was already configured");
            return;
        }
        throw new InstallationException("Unable to configure CouchDB single-node mode. HTTP " + response.statusCode());
    }

    private void putConfig(String accessUrl, String username, String password, String section, String key, String value, List<String> logs) {
        HttpResponse<String> response = send(accessUrl + "/_node/_local/_config/" + section + "/" + key, username, password, "PUT", "\"" + value + "\"");
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new InstallationException("Unable to configure CouchDB " + section + "." + key + " for Obsidian LiveSync. HTTP " + response.statusCode());
        }
        logs.add("Configured CouchDB " + section + "." + key);
    }

    private void createDatabase(String accessUrl, String username, String password, String database, List<String> logs) {
        HttpResponse<String> response = send(accessUrl + "/" + database, username, password, "PUT", null);
        if (response.statusCode() != 201 && response.statusCode() != 202 && response.statusCode() != 412) {
            throw new InstallationException("Unable to create the Obsidian sync database. HTTP " + response.statusCode());
        }
        logs.add(response.statusCode() == 412 ? "Obsidian sync database already exists" : "Created Obsidian sync database");
    }

    private HttpResponse<String> send(String url, String username, String password, String method, String body) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(3))
                .header("Authorization", basicAuth(username, password));
        if (body == null) {
            builder.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            builder.header("Content-Type", "application/json")
                    .method(method, HttpRequest.BodyPublishers.ofString(body));
        }
        try {
            return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        } catch (IOException exception) {
            throw new InstallationException("Unable to reach " + url, exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new InstallationException("Interrupted while reaching " + url, exception);
        }
    }

    private String basicAuth(String username, String password) {
        String value = username + ":" + password;
        return "Basic " + Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private String json(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private Map<String, String> environment(ApplicationManifest manifest) {
        Map<String, String> values = new LinkedHashMap<>();
        for (String environment : manifest.runtime().environment()) {
            String[] parts = environment.split("=", 2);
            if (parts.length == 2) {
                values.put(parts[0], parts[1]);
            }
        }
        return values;
    }

    private void sleep() {
        try {
            Thread.sleep(1000);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new InstallationException("Interrupted while waiting for CouchDB.", exception);
        }
    }
}

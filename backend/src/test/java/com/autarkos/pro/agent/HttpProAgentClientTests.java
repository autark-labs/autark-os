package com.autarkos.pro.agent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.pro.model.NormalizedHostSnapshot;
import com.autarkos.pro.runtime.ProAgentApiCredentialStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

class HttpProAgentClientTests {

    private static final String DIGEST = "sha256:" + "d".repeat(64);

    @TempDir
    Path runtimeRoot;

    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test
    void exercisesAuthenticatedUiAndSurfaceEndpoints()
            throws Exception {
        NormalizedHostSnapshot snapshot = snapshot();
        AtomicReference<String> authorization = new AtomicReference<>();
        AtomicReference<JsonNode> request = new AtomicReference<>();
        start(exchange -> {
            authorization.set(exchange.getRequestHeaders()
                    .getFirst("Authorization"));
            switch (exchange.getRequestURI().getPath()) {
                case "/v1/status" -> respond(exchange, 200, statusJson());
                case "/v1/ui/manifest" -> respond(
                        exchange, 200, manifestJson());
                case "/v1/ui/assets/entry.js" -> respondText(
                        exchange, 200, "text/javascript",
                        "export function mount(){}");
                case "/v1/surfaces/render" -> {
                    request.set(new ObjectMapper().readTree(
                            exchange.getRequestBody()));
                    respond(exchange, 200, surfaceJson());
                }
                default -> respond(exchange, 404, "{}");
            }
        });
        HttpProAgentClient client = fixture(Duration.ofSeconds(1)).client();

        assertThat(client.status(endpoint()).ready()).isTrue();
        assertThat(client.uiManifest(endpoint()).surfaces())
                .containsExactly("pro.dashboard");
        assertThat(new String(
                client.uiAsset(endpoint(), "entry.js"),
                StandardCharsets.UTF_8)).contains("mount");
        assertThat(client.renderSurface(
                        endpoint(),
                        "pro.dashboard",
                        snapshot,
                        "opaque_previous_state")
                .continuationToken())
                .isEqualTo("opaque_next_state");
        assertThat(request.get().path("schemaVersion").asText())
                .isEqualTo("1");
        assertThat(request.get().path("snapshot").path("snapshotId").asText())
                .isEqualTo(snapshot.snapshotId());
        assertThat(request.get().path("continuationToken").asText())
                .isEqualTo("opaque_previous_state");
        assertThat(authorization.get()).startsWith("Bearer ")
                .doesNotContain("\n", "\r");
    }

    @Test
    void rejectsStrictlyInvalidJsonContracts() throws Exception {
        for (String body : List.of(
                statusJson().replace(
                        "\"ready\":true",
                        "\"ready\":true,\"unexpected\":true"),
                statusJson().replace("\"apiVersion\":\"1\",", ""),
                statusJson().replace("\"ready\":true", "\"ready\":false"))) {
            stopServer();
            start(exchange -> respond(exchange, 200, body));
            HttpProAgentClient client = fixture(Duration.ofSeconds(1)).client();
            assertThatThrownBy(() -> client.status(endpoint()))
                    .isInstanceOf(ProAgentClientException.class);
        }
    }

    @Test
    void boundsResponsesAndDoesNotFollowRedirects() throws Exception {
        start(exchange -> respond(
                exchange,
                200,
                "{\"padding\":\"" + "x".repeat(20 * 1024) + "\"}"));
        HttpProAgentClient client = fixture(Duration.ofSeconds(1)).client();
        HttpProAgentClient oversized = client;
        assertCode(() -> oversized.status(endpoint()), "agent_response_too_large");

        stopServer();
        start(exchange -> {
            exchange.getResponseHeaders().set("Location", "http://127.0.0.1:1/");
            exchange.sendResponseHeaders(302, -1);
        });
        client = fixture(Duration.ofSeconds(1)).client();
        HttpProAgentClient redirected = client;
        assertCode(() -> redirected.status(endpoint()), "agent_request_failed");
    }

    @Test
    void remoteErrorsNeverExposeResponseBodies() throws Exception {
        start(exchange -> respond(
                exchange,
                401,
                "{\"message\":\"secret marker\"}"));
        HttpProAgentClient client = fixture(Duration.ofSeconds(1)).client();

        assertThatThrownBy(() -> client.status(endpoint()))
                .isInstanceOf(ProAgentClientException.class)
                .hasMessageNotContaining("secret marker")
                .extracting(exception ->
                        ((ProAgentClientException) exception).code())
                .isEqualTo("agent_authentication_failed");
    }

    private Fixture fixture(Duration timeout) {
        AutarkOsRuntimeProperties properties =
                new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        ProAgentApiCredentialStore credentials =
                new ProAgentApiCredentialStore(new RuntimeLayout(properties));
        credentials.prepareMount();
        return new Fixture(new HttpProAgentClient(
                credentials,
                new ProAgentContractValidator(),
                timeout,
                HttpClient.newBuilder()
                        .connectTimeout(timeout)
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build()));
    }

    private ProAgentEndpoint endpoint() {
        return ProAgentEndpoint.forLoopbackTest(
                server.getAddress().getPort(), DIGEST);
    }

    private void start(ExchangeHandler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            try {
                handler.handle(exchange);
            } finally {
                exchange.close();
            }
        });
        server.start();
    }

    private static NormalizedHostSnapshot snapshot() {
        return new ProAgentSmokeSnapshotFactory().create(
                "1.2.3",
                "linux/amd64",
                Instant.parse("2026-07-19T12:00:00Z"));
    }

    private static String statusJson() {
        return """
                {
                  "schemaVersion":"1",
                  "componentVersion":"1.0.0",
                  "apiVersion":"1",
                  "supportedSnapshotSchemaVersions":["1"],
                  "supportedSurfaceSchemaVersions":["1"],
                  "state":"ready",
                  "ready":true,
                  "reasonCode":"none",
                  "startedAt":"2026-07-19T12:00:00Z"
                }
                """;
    }

    private static String manifestJson() {
        return """
                {
                  "schemaVersion":"1",
                  "extensionId":"autark-pro",
                  "componentVersion":"1.0.0",
                  "entrypoint":"entry.js",
                  "entrypointSha256":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  "surfaces":["pro.dashboard"]
                }
                """;
    }

    private static String surfaceJson() {
        return """
                {
                  "schemaVersion":"1",
                  "surface":"pro.dashboard",
                  "continuationToken":"opaque_next_state",
                  "payload":{"sections":[],"findings":[]}
                }
                """;
    }

    private static void respond(
            HttpExchange exchange,
            int status,
            String body) throws IOException {
        byte[] encoded = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, encoded.length);
        exchange.getResponseBody().write(encoded);
    }

    private static void respondText(
            HttpExchange exchange,
            int status,
            String contentType,
            String body) throws IOException {
        byte[] encoded = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.sendResponseHeaders(status, encoded.length);
        exchange.getResponseBody().write(encoded);
    }

    private static void assertCode(
            org.assertj.core.api.ThrowableAssert.ThrowingCallable callable,
            String code) {
        assertThatThrownBy(callable)
                .isInstanceOf(ProAgentClientException.class)
                .extracting(exception ->
                        ((ProAgentClientException) exception).code())
                .isEqualTo(code);
    }

    private record Fixture(HttpProAgentClient client) {
    }

    @FunctionalInterface
    private interface ExchangeHandler {
        void handle(HttpExchange exchange) throws IOException;
    }
}

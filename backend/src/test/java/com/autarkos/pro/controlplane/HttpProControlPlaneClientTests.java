package com.autarkos.pro.controlplane;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

class HttpProControlPlaneClientTests {

    private static final UUID REQUEST_ID =
            UUID.fromString("11111111-1111-4111-8111-111111111111");

    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void sendsActivationSecretOnlyInTlsEquivalentLoopbackRequestBody() throws Exception {
        AtomicReference<JsonNode> body = new AtomicReference<>();
        AtomicReference<String> requestId = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/functions/v1/activate", exchange -> {
            body.set(new ObjectMapper().readTree(exchange.getRequestBody()));
            requestId.set(exchange.getRequestHeaders().getFirst("X-Request-ID"));
            respond(exchange, 200, """
                    {
                      "schemaVersion":"1",
                      "activationTicket":"opaque_ticket_that_is_long_enough_for_v1",
                      "expiresAt":"2026-07-19T12:10:00Z",
                      "requestId":"11111111-1111-4111-8111-111111111111"
                    }
                    """);
        });
        server.start();
        HttpProControlPlaneClient client = client();

        ProControlPlaneClient.ActivationTicket result =
                client.startActivation("AUTARK-PRO-TEST-CODE", REQUEST_ID);

        assertThat(result.schemaVersion()).isEqualTo("1");
        assertThat(result.activationTicket()).startsWith("opaque_ticket");
        assertThat(body.get().path("method").asText()).isEqualTo("activation_code");
        assertThat(body.get().path("value").asText()).isEqualTo("AUTARK-PRO-TEST-CODE");
        assertThat(requestId.get()).isEqualTo(REQUEST_ID.toString());
    }

    @Test
    void preservesStableRemoteErrorCodeWithoutIncludingRequestSecret() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/functions/v1/activate", exchange -> respond(exchange, 400, """
                {
                  "error":{
                    "code":"invalid_code",
                    "message":"Activation code is invalid or unavailable.",
                    "requestId":"11111111-1111-4111-8111-111111111111"
                  }
                }
                """));
        server.start();
        HttpProControlPlaneClient client = client();

        assertThatThrownBy(() ->
                client.startActivation("AUTARK-PRO-SECRET-MUST-NOT-LEAK", REQUEST_ID))
                .isInstanceOf(ProControlPlaneException.class)
                .extracting(exception -> ((ProControlPlaneException) exception).code())
                .isEqualTo("invalid_code");
        assertThatThrownBy(() ->
                client.startActivation("AUTARK-PRO-SECRET-MUST-NOT-LEAK", REQUEST_ID))
                .hasMessageNotContaining("AUTARK-PRO-SECRET-MUST-NOT-LEAK");
    }

    @Test
    void rejectsRemotePlaintextAndEmbeddedCredentials() {
        assertThatThrownBy(() -> new HttpProControlPlaneClient(
                "http://control-plane.example/functions/v1",
                Duration.ofSeconds(1),
                HttpClient.newHttpClient()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("HTTPS");
        assertThatThrownBy(() -> new HttpProControlPlaneClient(
                "https://user:secret@control-plane.example/functions/v1",
                Duration.ofSeconds(1),
                HttpClient.newHttpClient()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining("secret");
    }

    @Test
    void rejectsMismatchedResponseCorrelationId() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/functions/v1/activate", exchange -> respond(exchange, 200, """
                {
                  "schemaVersion":"1",
                  "activationTicket":"opaque_ticket_that_is_long_enough_for_v1",
                  "expiresAt":"2026-07-19T12:10:00Z",
                  "requestId":"99999999-9999-4999-8999-999999999999"
                }
                """));
        server.start();

        assertThatThrownBy(() ->
                client().startActivation("AUTARK-PRO-TEST-CODE", REQUEST_ID))
                .isInstanceOf(ProControlPlaneException.class)
                .extracting(exception ->
                        ((ProControlPlaneException) exception).code())
                .isEqualTo("request_id_mismatch");
    }

    @Test
    void readsExactAssignedReleaseWithServerTimeAndCorrelation() throws Exception {
        AtomicReference<String> path = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/functions/v1/releases-check", exchange -> {
            path.set(exchange.getRequestURI().getPath());
            respond(exchange, 200, """
                    {
                      "schemaVersion":"1",
                      "release":{
                        "payload":"eA",
                        "protected":"eA",
                        "signature":"eA"
                      },
                      "serverTime":"2026-07-19T12:00:00Z",
                      "requestId":"11111111-1111-4111-8111-111111111111"
                    }
                    """);
        });
        server.start();

        var result = client().checkRelease(
                new ProControlPlaneClient.DeviceProofRequest(
                        "1",
                        new com.autarkos.pro.model.SignedEnvelopeV1(
                                "eA",
                                "eA",
                                "eA")),
                REQUEST_ID);

        assertThat(path.get()).isEqualTo("/functions/v1/releases-check");
        assertThat(result.release().payload()).isEqualTo("eA");
        assertThat(result.serverTime())
                .isEqualTo(java.time.Instant.parse("2026-07-19T12:00:00Z"));
    }

    @Test
    void readsRegistrySecretAsMutableRedactedCharacters() throws Exception {
        AtomicReference<JsonNode> body = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/functions/v1/registry-token", exchange -> {
            body.set(new ObjectMapper().readTree(exchange.getRequestBody()));
            respond(exchange, 200, """
                    {
                      "schemaVersion":"1",
                      "credentialId":"22222222-2222-4222-8222-222222222222",
                      "credentialType":"bearer",
                      "username":"autark-pro-token",
                      "secret":"header.payload.signature",
                      "repository":"registry.staging.autarklabs.com/autark-pro-agent",
                      "digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
                      "expiresAt":"2026-07-19T12:05:00Z",
                      "serverTime":"2026-07-19T12:00:00Z",
                      "requestId":"11111111-1111-4111-8111-111111111111"
                    }
                    """);
        });
        server.start();

        var result = client().issueRegistryCredential(
                new ProControlPlaneClient.RegistryCredentialRequest(
                        "1",
                        new com.autarkos.pro.model.SignedEnvelopeV1(
                                "eA",
                                "eA",
                                "eA"),
                        "autark-pro-agent",
                        "registry.staging.autarklabs.com/autark-pro-agent",
                        "sha256:dddddddddddddddddddddddddddddddd"
                                + "dddddddddddddddddddddddddddddddd"),
                REQUEST_ID);

        assertThat(body.get().path("component").asText())
                .isEqualTo("autark-pro-agent");
        assertThat(body.get().path("digest").asText())
                .isEqualTo("sha256:dddddddddddddddddddddddddddddddd"
                        + "dddddddddddddddddddddddddddddddd");
        assertThat(result.secret()).containsExactly(
                "header.payload.signature".toCharArray());
        assertThat(result.toString())
                .contains("secret=<redacted>")
                .doesNotContain("header.payload.signature");
    }

    private HttpProControlPlaneClient client() {
        return new HttpProControlPlaneClient(
                "http://127.0.0.1:" + server.getAddress().getPort() + "/functions/v1",
                Duration.ofSeconds(2),
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build());
    }

    private static void respond(HttpExchange exchange, int status, String body)
            throws IOException {
        byte[] encoded = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, encoded.length);
        exchange.getResponseBody().write(encoded);
        exchange.close();
    }
}

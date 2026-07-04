package com.autarkos.pro;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.Executors;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import com.autarkos.pro.models.ProRemoteModels;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

class SupabaseProRemoteClientTests {

    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void postsToRemoteRegistrationAndRedemptionEndpoints() throws Exception {
        server = startServer();
        server.createContext("/register-install", exchange -> json(exchange, 200, """
                {"installId":"ins_remote_123","installToken":"tok_remote_123","registeredAt":"2026-07-04T10:00:00Z"}
                """));
        server.createContext("/redeem-license", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            assertThat(body).contains("AUTARK-PRO-1234");
            json(exchange, 200, """
                    {"plan":"pro_home","entitlementStatus":"active","entitlementExpiresAt":"2027-07-04T00:00:00Z","userMessage":"License accepted."}
                    """);
        });

        SupabaseProRemoteClient client = client();

        ProRemoteModels.RegisterInstallResponse registration = client.registerInstall(new ProRemoteModels.RegisterInstallRequest(
                "Autark-OS",
                "0.0.1",
                "0.0.1",
                "linux-x86_64",
                null));
        ProRemoteModels.RedeemLicenseResponse redemption = client.redeemLicense(new ProRemoteModels.RedeemLicenseRequest(
                registration.installId(),
                "AUTARK-PRO-1234"));

        assertThat(registration.installId()).isEqualTo("ins_remote_123");
        assertThat(registration.installToken()).isEqualTo("tok_remote_123");
        assertThat(redemption.plan()).isEqualTo("pro_home");
        assertThat(redemption.entitlementStatus()).isEqualTo("active");
    }

    @Test
    void submitsHeartbeatAndFetchesFeedWithSinceQuery() throws Exception {
        server = startServer();
        server.createContext("/submit-heartbeat", exchange -> json(exchange, 200, """
                {"result":"accepted","receivedAt":"2026-07-04T10:01:00Z","userMessage":"Heartbeat accepted."}
                """));
        server.createContext("/pro-feed", exchange -> {
            assertThat(exchange.getRequestURI().getRawQuery()).contains("since=2026-07-04T09%3A00%3A00Z");
            json(exchange, 200, """
                    {"syncedAt":"2026-07-04T10:02:00Z","items":[{"id":"feed-1","title":"Welcome","body":"Hello","severity":"info","publishedAt":"2026-07-04T10:00:00Z"}]}
                    """);
        });

        SupabaseProRemoteClient client = client();

        ProRemoteModels.HeartbeatResponse heartbeat = client.submitHeartbeat(new ProRemoteModels.HeartbeatRequest(
                "ins_remote_123",
                Instant.parse("2026-07-04T10:00:00Z"),
                Map.of("appsReady", 3)));
        ProRemoteModels.ProFeedResponse feed = client.proFeed(Instant.parse("2026-07-04T09:00:00Z"));

        assertThat(heartbeat.result()).isEqualTo("accepted");
        assertThat(feed.items()).hasSize(1);
        assertThat(feed.items().getFirst().id()).isEqualTo("feed-1");
    }

    @Test
    void remoteFailureUsesProSpecificUserSafeError() throws Exception {
        server = startServer();
        server.createContext("/register-install", exchange -> json(exchange, 503, """
                {"message":"temporary outage"}
                """));

        SupabaseProRemoteClient client = client();

        assertThatThrownBy(() -> client.registerInstall(new ProRemoteModels.RegisterInstallRequest(
                "Autark-OS",
                "0.0.1",
                "0.0.1",
                "linux-x86_64",
                null)))
                .isInstanceOf(ProRemoteException.class)
                .hasMessageContaining("Autark Pro could not reach the remote service");
    }

    private SupabaseProRemoteClient client() {
        return new SupabaseProRemoteClient("http://localhost:" + server.getAddress().getPort(), 2, 2);
    }

    private static HttpServer startServer() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.setExecutor(Executors.newSingleThreadExecutor());
        server.start();
        return server;
    }

    private static void json(HttpExchange exchange, int status, String body) throws IOException {
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}

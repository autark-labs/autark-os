package com.autarkos.pro.agent;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpClient;
import java.nio.file.Path;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.pro.runtime.ProAgentApiCredentialStore;

@EnabledIfEnvironmentVariable(
        named = "AUTARK_PRO_LIVE_ENDPOINT",
        matches = ".+")
class ProAgentLiveContractTests {

    @Test
    void publicCoreClientValidatesRealPrivateAgent()
            throws Exception {
        String address = required(
                "AUTARK_PRO_LIVE_ENDPOINT");
        String digest = required(
                "AUTARK_PRO_LIVE_DIGEST");
        String runtimeRoot = required(
                "AUTARK_PRO_LIVE_RUNTIME_ROOT");
        AutarkOsRuntimeProperties properties =
                new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot);
        ProAgentApiCredentialStore credentials =
                new ProAgentApiCredentialStore(
                        new RuntimeLayout(properties));
        credentials.prepareMount();
        Duration timeout = Duration.ofSeconds(2);
        ProAgentContractValidator validator =
                new ProAgentContractValidator();
        HttpProAgentClient client = new HttpProAgentClient(
                credentials,
                validator,
                timeout,
                HttpClient.newBuilder()
                        .connectTimeout(timeout)
                        .followRedirects(
                                HttpClient.Redirect.NEVER)
                        .build());
        ProAgentEndpoint endpoint =
                ProAgentEndpoint.forAddress(
                        address,
                        digest);

        var status = client.status(endpoint);
        var manifest = client.uiManifest(endpoint);
        var entrypoint = client.uiAsset(
                endpoint, manifest.entrypoint());
        var snapshot =
                new ProAgentSmokeSnapshotFactory().create(
                        "1.2.3",
                        "linux/amd64",
                        java.time.Instant.now());
        var surface = client.renderSurface(
                endpoint,
                manifest.surfaces().getFirst(),
                snapshot,
                null);

        assertThat(status.state()).isEqualTo("ready");
        assertThat(status.ready()).isTrue();
        assertThat(status.apiVersion()).isEqualTo("1");
        assertThat(entrypoint).isNotEmpty();
        assertThat(surface.payload()).isNotNull();
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    "Missing live Pro agent test input.");
        }
        return value;
    }
}

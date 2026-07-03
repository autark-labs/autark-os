package com.autarkos.network.tailscale;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class DevTailscaleServiceTests {

    @Test
    void createsMockPrivateLinksWithoutCallingTailscaleServe() {
        DevTailscaleService service = new DevTailscaleService();

        TailscaleServeResult result = service.serveHttps(8096);

        assertThat(result.configured()).isTrue();
        assertThat(result.privateUrl()).isEqualTo("https://autark-os-dev.tailnet.local:8096");
        assertThat(result.message()).contains("Dev mode");
    }

    @Test
    void exposesMockConnectedTailnetForLocalSmokeTests() {
        DevTailscaleService service = new DevTailscaleService();

        TailscaleStatus status = service.status();

        assertThat(status.installed()).isTrue();
        assertThat(status.connected()).isTrue();
        assertThat(status.state()).isEqualTo("dev");
        assertThat(service.devices()).hasSize(2);
    }
}

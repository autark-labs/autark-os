package com.autarkos.access;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.autarkos.marketplace.install.AppInstanceView;
import com.autarkos.network.tailscale.TailscaleStatus;

class AccessStatusServiceTests {

    @Test
    void localAccessCanBeReadyWithoutTailscale() {
        AccessStatusService service = service(
                TailscaleStatus.notInstalled(),
                List.of(app("appinst_vaultwarden", "Vaultwarden", "local_ready", "http://host:8090", "")));

        AccessStatus status = service.status();

        assertThat(status.mode()).isEqualTo("local_only");
        assertThat(status.tailscale().mode()).isEqualTo("unavailable");
        assertThat(status.tailscale().signedIn()).isFalse();
        assertThat(status.apps()).singleElement().satisfies(app -> {
            assertThat(app.serverCanReach()).isTrue();
            assertThat(app.localUrl()).isEqualTo("http://host:8090");
        });
        assertThat(status.issues()).isEmpty();
    }

    @Test
    void requestedPrivateAccessReportsSignedOutTailscale() {
        AccessStatusService service = service(
                TailscaleStatus.notConnected("Tailscale is waiting for sign in."),
                List.of(app("appinst_vaultwarden", "Vaultwarden", "not_ready", "http://host:8090", "https://vaultwarden.tailnet.test")));

        AccessStatus status = service.status();

        assertThat(status.mode()).isEqualTo("private_needs_setup");
        assertThat(status.issues()).singleElement().satisfies(issue -> {
            assertThat(issue.scope()).isEqualTo("access");
            assertThat(issue.reasonCode()).isEqualTo("tailscale_not_signed_in");
            assertThat(issue.primaryAction()).isPresent();
        });
        assertThat(status.actions()).extracting(action -> action.id()).contains("open-tailscale-setup");
    }

    @Test
    void devMockCannotBeMistakenForProductionPrivateReadiness() {
        AccessStatusService service = service(
                new TailscaleStatus(true, true, "dev", "Mocked.", "autark-os-dev", "autark-os-dev.tailnet.test", List.of("100.64.0.10"), "dev-tailnet", "dev@example.test"),
                List.of(app("appinst_vaultwarden", "Vaultwarden", "private_ready", "http://host:8090", "https://autark-os-dev.tailnet.test")));

        AccessStatus status = service.status();

        assertThat(status.mode()).isEqualTo("mocked_dev");
        assertThat(status.tailscale().mode()).isEqualTo("mock");
        assertThat(status.issues()).singleElement().satisfies(issue -> {
            assertThat(issue.severity()).isEqualTo("info");
            assertThat(issue.reasonCode()).isEqualTo("tailscale_mock_dev");
        });
    }

    @Test
    void realPrivateAccessReadyRequiresSignedInTailscaleAndPrivateApp() {
        AccessStatusService service = service(
                new TailscaleStatus(true, true, "connected", "Connected.", "autark-os", "autark-os.tailnet.test", List.of("100.64.0.10"), "tailnet", "user@example.test"),
                List.of(app("appinst_vaultwarden", "Vaultwarden", "private_ready", "http://host:8090", "https://autark-os.tailnet.test")));

        AccessStatus status = service.status();

        assertThat(status.mode()).isEqualTo("private_ready");
        assertThat(status.tailscale().mode()).isEqualTo("real");
        assertThat(status.tailscale().magicDnsReady()).isTrue();
        assertThat(status.tailscale().httpsReady()).isTrue();
        assertThat(status.tailscale().serveReady()).isTrue();
        assertThat(status.issues()).isEmpty();
    }

    private AccessStatusService service(TailscaleStatus tailscaleStatus, List<AppInstanceView> apps) {
        return new AccessStatusService(() -> apps, () -> tailscaleStatus, () -> "http://host:8082", () -> Instant.parse("2026-06-20T12:00:00Z"));
    }

    private AppInstanceView app(String appInstanceId, String name, String accessState, String localUrl, String privateUrl) {
        return new AppInstanceView(
                appInstanceId,
                appInstanceId.replace("appinst_", ""),
                name,
                "Security",
                "",
                "Ready",
                "ready",
                "running",
                "owned",
                accessState,
                "backup_disabled",
                localUrl,
                privateUrl,
                List.of(),
                List.of(),
                Instant.parse("2026-06-20T12:00:00Z"));
    }
}

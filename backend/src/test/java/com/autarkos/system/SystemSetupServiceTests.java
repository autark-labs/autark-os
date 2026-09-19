package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.host.HostModels;
import com.autarkos.host.ObservedService;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.network.tailscale.TailscaleStatus;

class SystemSetupServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void reportsNeedsSetupWhenDockerAndTailscaleAreUnavailable() {
        SystemSetupService service = new SystemSetupService(
                runtimeLayout(),
                new FakeTailscaleService(TailscaleStatus.notConnected("Tailscale is waiting for sign in.")),
                command -> {
                    String joined = String.join(" ", command);
                    if (joined.startsWith("docker ")) {
                        return new SystemSetupService.CommandResult(1, "permission denied");
                    }
                    if (joined.equals("systemctl is-active autark-os")) {
                        return new SystemSetupService.CommandResult(3, "inactive");
                    }
                    return new SystemSetupService.CommandResult(0, "{}");
                });

        SystemSetupModels.SystemSetupStatus status = service.status();

        assertThat(status.status()).isEqualTo("needs_admin_setup");
        assertThat(status.checks())
                .anySatisfy(check -> {
                    assertThat(check.id()).isEqualTo("docker");
                    assertThat(check.status()).isEqualTo("warning");
                })
                .anySatisfy(check -> {
                    assertThat(check.id()).isEqualTo("tailscale");
                    assertThat(check.status()).isEqualTo("warning");
                });
    }

    @Test
    void productionStatusWarnsWhenExistingAutarkOsResourcesAreFound() {
        SystemSetupService service = new SystemSetupService(
                runtimeLayout(),
                new FakeTailscaleService(TailscaleStatus.notInstalled()),
                command -> new SystemSetupService.CommandResult(0, "29.6.0"),
                false,
                null,
                () -> new AutarkOsIdentity("current-instance", "homelab-box", runtimeRoot.toString(), "runtime-hash", Instant.parse("2026-06-20T12:00:00Z"), 1),
                () -> List.of(observedService("legacy_autark_os", ""), observedService("foreign_autark_os", "other-instance")));

        SystemSetupModels.SystemSetupStatus status = service.status();

        assertThat(status.existingInstall().conflict()).isTrue();
        assertThat(status.existingInstall().severity()).isEqualTo("warning");
        assertThat(status.existingInstall().resources()).hasSize(2);
        assertThat(status.existingInstall().resources()).extracting("kind")
                .containsOnly("previous_installation_resource");
        assertThat(status.existingInstall().actions()).extracting("id")
                .containsExactly("review_existing_apps", "abort");
        assertThat(status.checks()).anySatisfy(check -> {
            assertThat(check.id()).isEqualTo("existing-install");
            assertThat(check.status()).isEqualTo("warning");
            assertThat(check.actionCommand()).isEqualTo("/apps");
        });
    }

    @Test
    void devModeLabelsExistingResourcesAsAllowedDevelopmentIsolation() {
        SystemSetupService service = new SystemSetupService(
                runtimeLayout(),
                new FakeTailscaleService(TailscaleStatus.notInstalled()),
                command -> new SystemSetupService.CommandResult(0, "29.6.0"),
                true,
                null,
                () -> new AutarkOsIdentity("current-instance", "dev-box", runtimeRoot.toString(), "runtime-hash", Instant.parse("2026-06-20T12:00:00Z"), 1),
                () -> List.of(observedService("foreign_autark_os", "other-instance")));

        SystemSetupModels.SystemSetupStatus status = service.status();

        assertThat(status.instanceSlug()).isEqualTo("dev-box");
        assertThat(status.existingInstall().conflict()).isFalse();
        assertThat(status.existingInstall().developmentInstanceAllowed()).isTrue();
        assertThat(status.existingInstall().severity()).isEqualTo("info");
        assertThat(status.existingInstall().summary()).contains("development");
    }

    @Test
    void localProfileDoesNotRequestSystemdSetup() {
        var environment = new org.springframework.mock.env.MockEnvironment();
        environment.setActiveProfiles("local");
        var service = new SystemSetupService(runtimeLayout(), new FakeTailscaleService(TailscaleStatus.notInstalled()),
                command -> new SystemSetupService.CommandResult(3, "inactive"), false, environment);

        assertThat(service.status().checks()).anySatisfy(check -> {
            assertThat(check.id()).isEqualTo("systemd");
            assertThat(check.status()).isEqualTo("neutral");
            assertThat(check.message()).isEqualTo("Running a local backend process.");
        });
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private ObservedService observedService(String ownershipState, String ownerInstanceId) {
        return new ObservedService(
                "docker:" + ownershipState,
                HostModels.ObservedServiceSource.DOCKER,
                "autark-os-" + ownershipState,
                ownershipState,
                "http://localhost:8080",
                "local",
                "homepage",
                "label",
                ownershipState,
                "running",
                ownerInstanceId,
                Instant.parse("2026-06-20T12:00:00Z"),
                Instant.parse("2026-06-20T12:00:00Z"),
                "{}");
    }

    private static class FakeTailscaleService extends TailscaleService {
        private final TailscaleStatus status;

        private FakeTailscaleService(TailscaleStatus status) {
            this.status = status;
        }

        @Override
        public TailscaleStatus status() {
            return status;
        }

    }
}

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
    void reportsNeedsSetupWhenDockerAndServePermissionAreMissing() {
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
    void reportsServePermissionGrantCommandWhenOperatorIsMissing() {
        SystemSetupService service = new SystemSetupService(
                runtimeLayout(),
                new FakeTailscaleService(new TailscaleStatus(true, true, "connected", "Connected", "autark-os", "autark-os.tail.ts.net.", List.of("100.64.0.1"), "tail.ts.net", "owner@example.com")),
                command -> {
                    String joined = String.join(" ", command);
                    if (joined.startsWith("docker ")) {
                        return new SystemSetupService.CommandResult(0, "27.0.0");
                    }
                    if (joined.equals("tailscale serve status --json")) {
                        return new SystemSetupService.CommandResult(1, "Access denied: serve config denied");
                    }
                    if (joined.equals("systemctl is-active autark-os")) {
                        return new SystemSetupService.CommandResult(3, "inactive");
                    }
                    return new SystemSetupService.CommandResult(0, "{}");
                });

        SystemSetupModels.SystemSetupStatus status = service.status();

        assertThat(status.checks())
                .filteredOn(check -> check.id().equals("tailscale-operator"))
                .singleElement()
                .satisfies(check -> {
                    assertThat(check.status()).isEqualTo("warning");
                    assertThat(check.actionCommand()).contains("sudo tailscale set --operator=");
                });
    }

    @Test
    void reportsFileOpsSetupCommandWhenHelperPermissionIsMissing() {
        SystemSetupService service = new SystemSetupService(
                runtimeLayout(),
                new FakeTailscaleService(TailscaleStatus.notInstalled()),
                command -> {
                    String joined = String.join(" ", command);
                    if (joined.startsWith("docker ")) {
                        return new SystemSetupService.CommandResult(0, "27.0.0");
                    }
                    if (joined.equals("sudo -n /opt/autark-os/bin/autark-os-fileops --help")) {
                        return new SystemSetupService.CommandResult(1, "sudo: a password is required");
                    }
                    if (joined.equals("systemctl is-active autark-os")) {
                        return new SystemSetupService.CommandResult(3, "inactive");
                    }
                    return new SystemSetupService.CommandResult(0, "{}");
                });

        SystemSetupModels.SystemSetupStatus status = service.status();

        assertThat(status.checks())
                .filteredOn(check -> check.id().equals("fileops"))
                .singleElement()
                .satisfies(check -> {
                    assertThat(check.status()).isEqualTo("warning");
                    assertThat(check.message()).contains("file operations");
                    assertThat(check.actionCommand()).contains("install-autark-os-service.sh");
                });
    }


    @Test
    void devModeReportsLocalProcessNotesAndPrivilegedFileOpsWarning() {
        SystemSetupService service = new SystemSetupService(
                runtimeLayout(),
                new FakeTailscaleService(new TailscaleStatus(true, true, "dev", "Dev mode", "autark-os-dev", "autark-os-dev.tailnet.local", List.of("100.64.0.1"), "tail.ts.net", "owner@example.com")),
                command -> new SystemSetupService.CommandResult(1, "not available"),
                true);

        SystemSetupModels.SystemSetupStatus status = service.status();

        assertThat(status.checks())
                .anySatisfy(check -> {
                    assertThat(check.id()).isEqualTo("service-user");
                    assertThat(check.status()).isEqualTo("neutral");
                    assertThat(check.message()).contains("Dev mode");
                })
                .anySatisfy(check -> {
                    assertThat(check.id()).isEqualTo("tailscale-operator");
                    assertThat(check.status()).isEqualTo("ok");
                    assertThat(check.message()).contains("mock Tailscale");
                })
                .anySatisfy(check -> {
                    assertThat(check.id()).isEqualTo("fileops");
                    assertThat(check.status()).isEqualTo("warning");
                    assertThat(check.message()).contains("privileged file operations");
                })
                .anySatisfy(check -> {
                    assertThat(check.id()).isEqualTo("systemd");
                    assertThat(check.status()).isEqualTo("neutral");
                    assertThat(check.message()).contains("local backend");
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
        assertThat(status.existingInstall().actions()).extracting("id")
                .containsExactly("recover_existing_apps", "abort");
        assertThat(status.checks()).anySatisfy(check -> {
            assertThat(check.id()).isEqualTo("existing-install");
            assertThat(check.status()).isEqualTo("warning");
            assertThat(check.actionCommand()).isEqualTo("/resolve-existing-apps");
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
                "Apps",
                "local",
                "homepage",
                "label",
                ownershipState,
                "observed",
                "running",
                true,
                ownerInstanceId,
                Instant.parse("2026-06-20T12:00:00Z"),
                Instant.parse("2026-06-20T12:00:00Z"),
                null,
                null,
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

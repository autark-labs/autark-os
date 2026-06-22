package com.projectos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.host.ObservedService;
import com.projectos.host.ObservedServiceSource;
import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;
import com.projectos.network.tailscale.TailscaleService;
import com.projectos.network.tailscale.TailscaleStatus;
import com.projectos.system.api.SystemSetupStatus;

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
                    if (joined.equals("systemctl is-active project-os")) {
                        return new SystemSetupService.CommandResult(3, "inactive");
                    }
                    return new SystemSetupService.CommandResult(0, "{}");
                });

        SystemSetupStatus status = service.status();

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
                new FakeTailscaleService(new TailscaleStatus(true, true, "connected", "Connected", "project-os", "project-os.tail.ts.net.", List.of("100.64.0.1"), "tail.ts.net", "owner@example.com")),
                command -> {
                    String joined = String.join(" ", command);
                    if (joined.startsWith("docker ")) {
                        return new SystemSetupService.CommandResult(0, "27.0.0");
                    }
                    if (joined.equals("tailscale serve status --json")) {
                        return new SystemSetupService.CommandResult(1, "Access denied: serve config denied");
                    }
                    if (joined.equals("systemctl is-active project-os")) {
                        return new SystemSetupService.CommandResult(3, "inactive");
                    }
                    return new SystemSetupService.CommandResult(0, "{}");
                });

        SystemSetupStatus status = service.status();

        assertThat(status.checks())
                .filteredOn(check -> check.id().equals("tailscale-operator"))
                .singleElement()
                .satisfies(check -> {
                    assertThat(check.status()).isEqualTo("warning");
                    assertThat(check.actionCommand()).contains("sudo tailscale set --operator=");
                });
    }

    @Test
    void devModeReportsLocalProcessNotesInsteadOfProductionWarnings() {
        SystemSetupService service = new SystemSetupService(
                runtimeLayout(),
                new FakeTailscaleService(new TailscaleStatus(true, true, "dev", "Dev mode", "project-os-dev", "project-os-dev.tailnet.local", List.of("100.64.0.1"), "tail.ts.net", "owner@example.com")),
                command -> new SystemSetupService.CommandResult(1, "not available"),
                true);

        SystemSetupStatus status = service.status();

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
                    assertThat(check.id()).isEqualTo("systemd");
                    assertThat(check.status()).isEqualTo("neutral");
                    assertThat(check.message()).contains("local backend");
                });
    }

    @Test
    void productionStatusWarnsWhenExistingProjectOsResourcesAreFound() {
        SystemSetupService service = new SystemSetupService(
                runtimeLayout(),
                new FakeTailscaleService(TailscaleStatus.notInstalled()),
                command -> new SystemSetupService.CommandResult(0, "29.6.0"),
                false,
                null,
                () -> new ProjectOsIdentity("current-instance", "homelab-box", runtimeRoot.toString(), "runtime-hash", Instant.parse("2026-06-20T12:00:00Z"), 1),
                () -> List.of(observedService("legacy_project_os", ""), observedService("foreign_project_os", "other-instance")));

        SystemSetupStatus status = service.status();

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
                () -> new ProjectOsIdentity("current-instance", "dev-box", runtimeRoot.toString(), "runtime-hash", Instant.parse("2026-06-20T12:00:00Z"), 1),
                () -> List.of(observedService("foreign_project_os", "other-instance")));

        SystemSetupStatus status = service.status();

        assertThat(status.instanceSlug()).isEqualTo("dev-box");
        assertThat(status.existingInstall().conflict()).isFalse();
        assertThat(status.existingInstall().developmentInstanceAllowed()).isTrue();
        assertThat(status.existingInstall().severity()).isEqualTo("info");
        assertThat(status.existingInstall().summary()).contains("development");
    }

    private RuntimeLayout runtimeLayout() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private ObservedService observedService(String ownershipState, String ownerInstanceId) {
        return new ObservedService(
                "docker:" + ownershipState,
                ObservedServiceSource.DOCKER,
                "project-os-" + ownershipState,
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

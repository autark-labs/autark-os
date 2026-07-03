package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.api.SystemDoctorStatus;
import com.autarkos.system.api.SystemSetupCheck;
import com.autarkos.system.api.SystemSetupStatus;

class SystemDoctorServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void readinessAllowsAdvancedCompletionWhenOnlyDockerAndPrivateAccessNeedSetup() {
        SystemDoctorService service = service(List.of(
                ok("service-user"),
                ok("runtime-root"),
                warn("docker", "Docker", "Docker is not installed.", "Install Docker"),
                warn("tailscale", "Tailscale", "Tailscale is not connected.", "tailscale up"),
                neutral("tailscale-operator"),
                ok("systemd")));

        SystemDoctorStatus status = service.status();

        assertThat(status.readiness().status()).isEqualTo("apps_need_docker");
        assertThat(status.readiness().canCompleteOnboarding()).isTrue();
        assertThat(status.readiness().finishAnywayRequiresAdvanced()).isTrue();
        assertThat(status.readiness().groups())
                .anySatisfy(group -> {
                    assertThat(group.id()).isEqualTo("app-installs");
                    assertThat(group.status()).isEqualTo("warning");
                })
                .anySatisfy(group -> {
                    assertThat(group.id()).isEqualTo("private-access");
                    assertThat(group.status()).isEqualTo("warning");
                });
    }

    @Test
    void readinessBlocksCompletionWhenRuntimeStorageIsNotUsable() {
        SystemDoctorService service = service(List.of(
                ok("service-user"),
                warn("runtime-root", "Runtime storage", "Autark-OS cannot write to storage.", "Repair permissions"),
                ok("docker"),
                ok("tailscale"),
                ok("tailscale-operator"),
                ok("systemd")));

        SystemDoctorStatus status = service.status();

        assertThat(status.readiness().status()).isEqualTo("storage_needs_review");
        assertThat(status.readiness().canCompleteOnboarding()).isFalse();
        assertThat(status.readiness().finishAnywayRequiresAdvanced()).isFalse();
    }

    private SystemDoctorService service(List<SystemSetupCheck> setupChecks) {
        RuntimeLayout runtimeLayout = runtimeLayout();
        ProjectSettingsRepository repository = new ProjectSettingsRepository(runtimeLayout);
        return new SystemDoctorService(new FakeSystemSetupService(setupChecks), repository, runtimeLayout);
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private static SystemSetupCheck ok(String id) {
        return new SystemSetupCheck(id, label(id), "ok", label(id) + " is ready.", "", null, null);
    }

    private static SystemSetupCheck warn(String id, String label, String message, String actionCommand) {
        return new SystemSetupCheck(id, label, "warning", message, "", "Fix " + label, actionCommand);
    }

    private static SystemSetupCheck neutral(String id) {
        return new SystemSetupCheck(id, label(id), "neutral", label(id) + " is waiting.", "", null, null);
    }

    private static String label(String id) {
        return switch (id) {
            case "runtime-root" -> "Runtime storage";
            case "tailscale-operator" -> "Tailscale Serve permission";
            default -> id;
        };
    }

    private static class FakeSystemSetupService extends SystemSetupService {
        private final List<SystemSetupCheck> checks;

        private FakeSystemSetupService(List<SystemSetupCheck> checks) {
            super(null, null, command -> new CommandResult(0, ""));
            this.checks = checks;
        }

        @Override
        public SystemSetupStatus status() {
            return new SystemSetupStatus(
                    "needs_admin_setup",
                    "Autark-OS needs host setup",
                    "Review setup.",
                    "jack",
                    "autarkos",
                    false,
                    "default",
                    "8082",
                    "/",
                    "not installed",
                    "not installed",
                    "current-instance",
                    "homelab-box",
                    new com.autarkos.system.api.SystemSetupExistingInstallReport(false, false, "ok", "No existing Autark-OS install found", "No existing Autark-OS install found.", java.util.List.of(), java.util.List.of()),
                    "sudo install-autark-os-service.sh",
                    checks,
                    java.time.Instant.now());
        }
    }
}

package com.projectos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.projectos.api.ProjectOsAction;
import com.projectos.api.ProjectOsIssue;
import com.projectos.api.ProjectOsIssueFactory;
import com.projectos.marketplace.install.AppInstanceView;
import com.projectos.system.api.SystemSetupStatus;

class SystemSummaryServiceTests {

    @Test
    void aggregatesAppCountsAndIssuesForHome() {
        ProjectOsIssue missingIssue = ProjectOsIssueFactory.appIssue(
                "app-missing-vaultwarden",
                "vaultwarden",
                "critical",
                "app_missing_container",
                "Vaultwarden is missing",
                "Autark-OS cannot find the container for this app.",
                ProjectOsAction.post("repair-vaultwarden", "Repair", "/api/apps/vaultwarden/repair", false, false));
        AppInstanceView ready = app("appinst_homepage", "homepage", "Homepage", "Ready", "http://localhost:3000", List.of());
        AppInstanceView missing = app("appinst_vaultwarden", "vaultwarden", "Vaultwarden", "Missing", "", List.of(missingIssue));
        SystemSummaryService service = new SystemSummaryService(
                () -> List.of(ready, missing),
                () -> ProjectSettings.defaults("project-os-test"),
                () -> new ProjectOsIdentity("pos_test", "project-os-test", "/runtime", "sha256:test", Instant.parse("2026-06-20T12:00:00Z"), 1),
                () -> setupStatus("ready", "Docker 29.6.0"),
                () -> "http://192.168.122.50:8082",
                () -> Instant.parse("2026-06-20T13:00:00Z"));

        SystemSummary summary = service.summary();

        assertThat(summary.deviceName()).isEqualTo("project-os-test");
        assertThat(summary.instanceId()).isEqualTo("pos_test");
        assertThat(summary.lanUrl()).isEqualTo("http://192.168.122.50:8082");
        assertThat(summary.docker().ready()).isTrue();
        assertThat(summary.apps().installed()).isEqualTo(2);
        assertThat(summary.apps().running()).isEqualTo(1);
        assertThat(summary.apps().needsAttention()).isEqualTo(1);
        assertThat(summary.apps().readyToOpen()).singleElement().satisfies(app -> {
            assertThat(app.appInstanceId()).isEqualTo("appinst_homepage");
            assertThat(app.name()).isEqualTo("Homepage");
            assertThat(app.url()).isEqualTo("http://localhost:3000");
        });
        assertThat(summary.issues()).containsExactly(missingIssue);
        assertThat(summary.updatedAt()).isEqualTo(Instant.parse("2026-06-20T13:00:00Z"));
    }

    @Test
    void reportsDockerUnavailableFromSetupStatus() {
        SystemSummaryService service = new SystemSummaryService(
                List::of,
                () -> ProjectSettings.defaults("project-os-test"),
                () -> new ProjectOsIdentity("pos_test", "project-os-test", "/runtime", "sha256:test", Instant.parse("2026-06-20T12:00:00Z"), 1),
                () -> setupStatus("needs_admin_setup", "not installed"),
                () -> "http://localhost:8082",
                Instant::now);

        SystemSummary summary = service.summary();

        assertThat(summary.docker().ready()).isFalse();
        assertThat(summary.issues()).anySatisfy(issue -> {
            assertThat(issue.scope()).isEqualTo("system");
            assertThat(issue.reasonCode()).isEqualTo("docker_unavailable");
        });
    }

    @Test
    void usesCanonicalSetupProgressWhenAvailable() {
        SystemSummaryService service = new SystemSummaryService(
                List::of,
                () -> ProjectSettings.defaults("project-os-test"),
                () -> new ProjectOsIdentity("pos_test", "project-os-test", "/runtime", "sha256:test", Instant.parse("2026-06-20T12:00:00Z"), 1),
                () -> setupStatus("ready", "Docker 29.6.0"),
                () -> new SetupProgress(1, List.of("welcome"), List.of("tailscale_connect"), "host_check", false, Instant.parse("2026-06-20T12:00:00Z")),
                () -> "http://localhost:8082",
                Instant::now);

        SystemSummary summary = service.summary();

        assertThat(summary.setup().complete()).isFalse();
        assertThat(summary.setup().status()).isEqualTo("in_progress");
        assertThat(summary.setup().nextStep()).isEqualTo("host_check");
    }

    private AppInstanceView app(String appInstanceId, String catalogAppId, String name, String status, String url, List<ProjectOsIssue> issues) {
        return new AppInstanceView(
                appInstanceId,
                catalogAppId,
                name,
                "General",
                "",
                status,
                status.toLowerCase(),
                status.toLowerCase(),
                "owned",
                url.isBlank() ? "not_ready" : "local_ready",
                "backup_disabled",
                url,
                null,
                issues,
                List.of(),
                Instant.parse("2026-06-20T12:30:00Z"));
    }

    private SystemSetupStatus setupStatus(String status, String dockerVersion) {
        return new SystemSetupStatus(
                status,
                "Setup",
                "Setup summary",
                "test",
                "projectos",
                true,
                "test",
                "8082",
                "/",
                dockerVersion,
                "not installed",
                "current-instance",
                "homelab-box",
                new com.projectos.system.api.SystemSetupExistingInstallReport(false, true, "ok", "No existing Autark-OS install found", "No existing Autark-OS install found.", List.of(), List.of()),
                "install",
                List.of(),
                Instant.parse("2026-06-20T12:00:00Z"));
    }
}

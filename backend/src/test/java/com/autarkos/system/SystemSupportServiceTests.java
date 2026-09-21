package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsAction;
import com.autarkos.api.AutarkOsIssue;
import com.autarkos.api.AutarkOsIssueFactory;

class SystemSupportServiceTests {

    @Test
    void redactsLocalIdentityPathsInGeneratedReport() {
        ActivityLogService activityLogService = mock(ActivityLogService.class);
        SystemMetricsService metricsService = mock(SystemMetricsService.class);
        SystemSetupService setupService = mock(SystemSetupService.class);
        ProjectVersionService versionService = mock(ProjectVersionService.class);
        Instant checkedAt = Instant.parse("2026-09-20T12:00:00Z");
        when(activityLogService.recent(30)).thenReturn(List.of());
        when(activityLogService.recent(80)).thenReturn(List.of());
        when(setupService.status()).thenReturn(new SystemSetupModels.SystemSetupStatus(
                "ready", "Ready", "Setup is ready.", "owner", "owner", false,
                "production", "8082", "", "27.0", "1.80", "instance-id", "instance-slug",
                null, "autark-os install", List.of(), checkedAt));
        when(versionService.info()).thenReturn(new ProjectVersionInfo(
                "1.2.3", "abc123", "2026-09-20", "/home/install-owner/autark-os",
                "/home/runtime-owner/autark-os/runtime", "instance-id", "instance-slug", "runtime-hash",
                "/Users/build-owner/autark-os/backend.jar", checkedAt));
        when(metricsService.metrics()).thenReturn(new SystemMetrics(
                "test-server", "owner", "Linux", "6.8", "amd64", "21", 4,
                5, 1, 0.2, 1024, 512, 50, "/home/storage-owner/autark-os/data",
                2048, 1024, 50, checkedAt));
        SystemSupportService service = new SystemSupportService(
                activityLogService, metricsService, setupService, null, null, null, null,
                versionService, null, command -> new SystemSupportService.CommandResult(0, "INFO service ready"));

        String report = service.bundle().bundleText();

        assertThat(report)
                .doesNotContain("install-owner", "runtime-owner", "build-owner", "storage-owner")
                .contains("Redaction: enabled", "Version: 1.2.3", "Build SHA: abc123", "Java: 21")
                .contains("Install path: [home-path-redacted]/autark-os")
                .contains("Runtime path: [home-path-redacted]/autark-os/runtime")
                .contains("Backend jar: [home-path-redacted]/autark-os/backend.jar")
                .contains("Runtime root: [home-path-redacted]/autark-os/data");
    }

    @Test
    void redactsSecretsAndTailnetUrls() {
        SupportDataRedactor redactor = new SupportDataRedactor();

        String redacted = redactor.redact("COUCHDB_PASSWORD=secret123 token: abc setupCode=AAAA-BBBB Cookie: autark-os-admin-session=session-value; other=cookie-value\nhttps://project.tail123.ts.net:5984 100.90.12.8 Authorization: Bearer abcdefghijklmnop {\"api_key\":\"json-secret\",\"hostname\":\"raspberrypi\"} http://192.168.1.20:8082 /home/jackson/autark-os user@example.com deviceName=home-server");

        assertThat(redacted)
                .doesNotContain("secret123")
                .doesNotContain("abc")
                .doesNotContain("project.tail123.ts.net")
                .doesNotContain("100.90.12.8")
                .doesNotContain("abcdefghijklmnop")
                .doesNotContain("json-secret")
                .doesNotContain("AAAA-BBBB")
                .doesNotContain("session-value")
                .doesNotContain("cookie-value")
                .doesNotContain("raspberrypi")
                .doesNotContain("192.168.1.20")
                .doesNotContain("jackson")
                .doesNotContain("user@example.com")
                .doesNotContain("home-server")
                .contains("COUCHDB_PASSWORD=[redacted]")
                .contains("token: [redacted]")
                .contains("[tailnet-url-redacted]")
                .contains("[tailnet-ip-redacted]")
                .contains("Bearer [redacted]")
                .contains("\"api_key\":\"[redacted]\"")
                .contains("[private-url-redacted]")
                .contains("[home-path-redacted]")
                .contains("[email-redacted]")
                .contains("[host-redacted]");
    }

    @Test
    void redactsSupportLogLinesAndKeepsTheirActionableSeverity() {
        SupportDataRedactor redactor = new SupportDataRedactor();

        SupportModels.SupportLogLine line = redactor.redactLogLine("ERROR: backup failed with token=private-token");

        assertThat(line.line()).contains("ERROR: backup failed with token=[redacted]");
        assertThat(line.level()).isEqualTo("error");
        assertThat(line.redacted()).isTrue();
    }

    @Test
    void exposesUnifiedIssuesWhenSystemSummaryIsAvailable() {
        AutarkOsIssue issue = AutarkOsIssueFactory.appIssue(
                "app-missing-vaultwarden",
                "vaultwarden",
                "critical",
                "app_missing_container",
                "Vaultwarden is missing",
                "Autark-OS cannot find the container for this app.",
                AutarkOsAction.route("open-apps", "Open apps", "/applications"));
        SystemSummaryModels.SystemSummary summary = new SystemSummaryModels.SystemSummary(
                "autark-os-test",
                "pos_test",
                "http://localhost:8082",
                new SetupProgressModels.SetupProgressSummary(true, "complete", "done", "Setup is complete."),
                new SystemSummaryModels.DockerSummary(true, "Docker is ready."),
                new SystemSummaryModels.AccessSummary("local_only", "Local access is ready."),
                new SystemSummaryModels.AppsSummary(1, 0, 1, List.of()),
                new SystemSummaryModels.BackupSummary("not_configured", "No restore point is required yet."),
                new SystemSummaryModels.StorageSummary("unknown", "Storage details are available from the Storage page."),
                List.of(issue),
                Instant.parse("2026-06-20T12:00:00Z"));
        SystemSupportService service = new SystemSupportService(null, null, null, command -> new SystemSupportService.CommandResult(0, ""), () -> summary);

        assertThat(service.unifiedIssues()).containsExactly(issue);
    }
}

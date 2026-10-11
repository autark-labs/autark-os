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
    void redactsEquivalentPrivateIpv6LiteralsAndPreservesPublicAddresses() {
        var redactor = new SupportDataRedactor();
        for (String host : List.of("::1", "0:0:0:0:0:0:0:1", "::ffff:192.168.1.2",
                "::ffff:c0a8:102", "0:0:0:0:0:ffff:a00:1", "::ffff:100.90.12.8",
                "fd12::1", "fc00::1", "fe80::1234%25eth0")) {
            assertThat(redactor.redact("Connect https://[" + host + "]:8080/private?view=health"))
                    .as(host).isEqualTo("Connect [private-url-redacted]");
        }
        for (String host : List.of("2001:4860:4860::8888", "2001:db8::1234", "::ffff:8.8.8.8")) {
            String url = "https://[" + host + "]:443/docs";
            assertThat(redactor.redact(url)).as(host).isEqualTo(url);
        }
    }

    @Test
    void redactsCommonCredentialAndJournalFormatsWithoutDamagingDiagnostics() {
        SupportDataRedactor redactor = new SupportDataRedactor();
        String source = """
                Authorization: Basic ZmFrZTpmaXh0dXJl
                Authorization: Bearer short-token
                {"access_token":"fixture-access", "refreshToken":"fixture-refresh", "password":"two word fixture"}
                COUCHDB_PASSWORD="multi word secret"
                password='another private phrase'
                https://fixture-user:fixture-pass@example.com/resource
                http://[fd7a:115c:a1e0::1234]:8080/private?token=fixture-query
                https://[fe80::1234%25eth0]/private
                Oct 08 12:00:00 fixture-host autark-os[123]: ready
                2026-10-08T12:00:00+00:00 fixture-host autark-os[123]: ready
                Version: 1.2.3 status=ready authRequired=true tokenCount=3 sessionTimeout=30
                https://example.com/docs GET /api/system/metrics CPU=25%
                """;

        assertThat(redactor.redact(source))
                .doesNotContain("ZmFrZTpmaXh0dXJl", "short-token", "fixture-access", "fixture-refresh",
                        "two word fixture", "multi word secret", "another private phrase", "fixture-user", "fixture-pass",
                        "fd7a:", "fe80:", "fixture-query", "fixture-host")
                .contains("Version: 1.2.3", "status=ready", "authRequired=true", "tokenCount=3", "sessionTimeout=30",
                        "https://example.com/docs", "GET /api/system/metrics", "CPU=25%", "autark-os[123]: ready");
    }

    @Test
    void sanitizesNestedExportsAndEscapedSecretsWhilePreservingTypes() {
        var redactor = new SupportDataRedactor();
        var json = tools.jackson.databind.json.JsonMapper.builder().build();
        var source = json.readTree("""
                {"nested":[{"access_token":"private access", "password":"first \\"quoted\\" secret", "hostname":"private-host"}],
                 "authRequired":true,"tokenCount":3,"sessionTimeout":30,"cpuPercent":12.5,"optional":null}
                """);
        var safe = redactor.redactExport(source, tools.jackson.databind.JsonNode.class);
        assertThat(safe.toString()).doesNotContain("private access", "quoted", "private-host");
        assertThat(safe.path("authRequired").asBoolean()).isTrue();
        assertThat(safe.path("tokenCount").asInt()).isEqualTo(3);
        assertThat(safe.path("cpuPercent").asDouble()).isEqualTo(12.5);
        assertThat(safe.path("optional").isNull()).isTrue();
        assertThat(redactor.redact(source.toString())).doesNotContain("private access", "quoted", "private-host");
        var issue = AutarkOsIssueFactory.appIssue("app-missing", "vaultwarden", "critical", "missing",
                "App is missing", "Check https://fixture.tail123.ts.net", AutarkOsAction.route("apps", "Open apps", "/apps"));
        var safeIssue = redactor.redactExport(issue, AutarkOsIssue.class);
        assertThat(safeIssue.summary()).doesNotContain("fixture.tail123.ts.net");
        assertThat(safeIssue.primaryAction().orElseThrow().route()).contains("/apps");
    }

    @Test
    void buildsAppSupportFromCanonicalStateAndRedactsPrivateRuntimeDetails() {
        var app = mock(com.autarkos.apps.ApplicationView.class);
        var runtime = mock(com.autarkos.marketplace.install.AppRuntimeView.class);
        when(app.id()).thenReturn("vaultwarden");
        when(app.name()).thenReturn("Vaultwarden");
        when(app.relationshipLabel()).thenReturn("Managed app");
        when(app.runtime()).thenReturn(runtime);
        when(runtime.state()).thenReturn(com.autarkos.apps.ApplicationRuntimeState.READY);
        when(runtime.runtimePath()).thenReturn("/home/fixture-owner/apps/vaultwarden");
        when(runtime.accessUrl()).thenReturn("https://fixture.tail123.ts.net:443");
        when(runtime.recentEvents()).thenReturn(List.of(new com.autarkos.marketplace.install.AppEvent(
                1, "vaultwarden", "error", "Could not start: password=\"private multi word\"", Instant.now())));
        var service = new SystemSupportService(null, null, null, command -> new SystemSupportService.CommandResult(0, ""));

        var report = service.appReport(app);

        assertThat(report.redacted()).isTrue();
        assertThat(report.bundleText()).contains("Vaultwarden", "Managed app", "READY", "Could not start")
                .doesNotContain("fixture-owner", "fixture.tail123.ts.net", "private multi word");
        assertThat(runtime.accessUrl()).isEqualTo("https://fixture.tail123.ts.net:443");
    }

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

        SupportModels.SupportBundle bundle = service.bundle();
        String report = bundle.bundleText();

        assertThat(bundle.redacted()).isTrue();
        assertThat(bundle.setup().runAsUser()).doesNotContain("owner");
        assertThat(bundle.metrics().deviceName()).doesNotContain("test-server");
        assertThat(bundle.version().runtimePath()).doesNotContain("runtime-owner");

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

package com.projectos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.projectos.api.ProjectOsAction;
import com.projectos.api.ProjectOsIssue;
import com.projectos.api.ProjectOsIssueFactory;

class SystemSupportServiceTests {

    @Test
    void redactsSecretsAndTailnetUrls() {
        SystemSupportService service = new SystemSupportService(null, null, null, command -> new SystemSupportService.CommandResult(0, ""));

        String redacted = service.redact("COUCHDB_PASSWORD=secret123 token: abc https://project.tail123.ts.net:5984 100.90.12.8 Authorization: Bearer abcdefghijklmnop {\"api_key\":\"json-secret\"}");

        assertThat(redacted)
                .doesNotContain("secret123")
                .doesNotContain("abc")
                .doesNotContain("project.tail123.ts.net")
                .doesNotContain("100.90.12.8")
                .doesNotContain("abcdefghijklmnop")
                .doesNotContain("json-secret")
                .contains("COUCHDB_PASSWORD=[redacted]")
                .contains("token: [redacted]")
                .contains("[tailnet-url-redacted]")
                .contains("[tailnet-ip-redacted]")
                .contains("Bearer [redacted]")
                .contains("\"api_key\":\"[redacted]\"");
    }

    @Test
    void exposesUnifiedIssuesWhenSystemSummaryIsAvailable() {
        ProjectOsIssue issue = ProjectOsIssueFactory.appIssue(
                "app-missing-vaultwarden",
                "vaultwarden",
                "critical",
                "app_missing_container",
                "Vaultwarden is missing",
                "Autark-OS cannot find the container for this app.",
                ProjectOsAction.route("open-apps", "Open apps", "/applications"));
        SystemSummary summary = new SystemSummary(
                "project-os-test",
                "pos_test",
                "http://localhost:8082",
                new SetupProgressSummary(true, "complete", "done", "Setup is complete."),
                new DockerSummary(true, "Docker is ready."),
                new AccessSummary("local_only", "Local access is ready."),
                new AppsSummary(1, 0, 1, List.of()),
                new BackupSummary("not_configured", "No restore point is required yet."),
                new StorageSummary("unknown", "Storage details are available from the Storage page."),
                List.of(issue),
                Instant.parse("2026-06-20T12:00:00Z"));
        SystemSupportService service = new SystemSupportService(null, null, null, command -> new SystemSupportService.CommandResult(0, ""), () -> summary);

        assertThat(service.unifiedIssues()).containsExactly(issue);
    }
}

package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

import org.junit.jupiter.api.Test;

import com.autarkos.api.AutarkOsAction;
import com.autarkos.api.AutarkOsIssue;

class RecommendedActionServiceTests {

    @Test
    void setupActionWinsBeforeIssuePriority() {
        RecommendedActionService service = service(
                summary(false, List.of(issue("docker", "critical", "docker_unavailable"))));

        RecommendedAction action = service.current();

        assertThat(action.id()).isEqualTo("complete-setup");
        assertThat(action.primaryAction()).contains(AutarkOsAction.route("open-setup", "Continue setup", "/setup"));
    }

    @Test
    void appSafetyIssuesWinBeforeBackupAndPrivateAccess() {
        RecommendedActionService service = service(
                summary(true, List.of(
                        issue("private", "info", "private_access_needs_setup"),
                        issue("backup", "info", "backup_enabled_no_restore_point"),
                        issue("app", "warning", "app_missing_container"))));

        RecommendedAction action = service.current();

        assertThat(action.id()).isEqualTo("app");
        assertThat(action.title()).isEqualTo("app_missing_container title");
    }

    @Test
    void backupRestorePointPromptWinsBeforePrivateAccessSetup() {
        RecommendedActionService service = service(
                summary(true, List.of(
                        issue("private", "info", "private_access_needs_setup"),
                        issue("backup", "info", "backup_enabled_no_restore_point"))));

        RecommendedAction action = service.current();

        assertThat(action.id()).isEqualTo("backup");
    }

    @Test
    void serviceAlwaysReturnsTheCurrentHighestPriorityIssue() {
        RecommendedActionService service = service(summary(true, List.of(
                issue("warning-app", "warning", "app_needs_attention"),
                issue("backup", "info", "backup_enabled_no_restore_point"))));

        assertThat(service.current().id()).isEqualTo("warning-app");
    }

    private RecommendedActionService service(SystemSummaryModels.SystemSummary summary) {
        return new RecommendedActionService((Supplier<SystemSummaryModels.SystemSummary>) () -> summary);
    }

    private SystemSummaryModels.SystemSummary summary(boolean setupComplete, List<AutarkOsIssue> issues) {
        return new SystemSummaryModels.SystemSummary(
                "Autark-OS",
                "instance-1",
                "http://localhost:8082",
                new SetupProgressModels.SetupProgressSummary(setupComplete, setupComplete ? "complete" : "in_progress", setupComplete ? "done" : "host_check", setupComplete ? "Setup is complete." : "Setup is incomplete."),
                new SystemSummaryModels.DockerSummary(true, "Docker is ready."),
                new SystemSummaryModels.AccessSummary("local_only", "Local access is ready."),
                new SystemSummaryModels.AppsSummary(1, 1, 0, List.of()),
                new SystemSummaryModels.BackupSummary("needs_restore_point", "A restore point is needed."),
                new SystemSummaryModels.StorageSummary("ok", "Storage is available."),
                issues,
                Instant.parse("2026-06-21T12:00:00Z"));
    }

    private AutarkOsIssue issue(String id, String severity, String reasonCode) {
        return new AutarkOsIssue(
                id,
                "system",
                "",
                severity,
                reasonCode,
                reasonCode + " title",
                reasonCode + " summary",
                Optional.of(AutarkOsAction.route("open-" + id, "Open " + id, "/" + id)),
                List.of(),
                Map.of());
    }
}

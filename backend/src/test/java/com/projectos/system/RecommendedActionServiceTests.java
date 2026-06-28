package com.projectos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.projectos.api.ProjectOsAction;
import com.projectos.api.ProjectOsIssue;

class RecommendedActionServiceTests {

    @Test
    void setupActionWinsBeforeIssuePriority() {
        RecommendedActionService service = service(
                summary(false, List.of(issue("docker", "critical", "docker_unavailable"))),
                new InMemoryDismissals());

        RecommendedAction action = service.current();

        assertThat(action.id()).isEqualTo("complete-setup");
        assertThat(action.primaryAction()).contains(ProjectOsAction.route("open-setup", "Continue setup", "/setup"));
    }

    @Test
    void appSafetyIssuesWinBeforeBackupAndPrivateAccess() {
        RecommendedActionService service = service(
                summary(true, List.of(
                        issue("private", "info", "private_access_needs_setup"),
                        issue("backup", "info", "backup_enabled_no_restore_point"),
                        issue("app", "warning", "app_missing_container"))),
                new InMemoryDismissals());

        RecommendedAction action = service.current();

        assertThat(action.id()).isEqualTo("app");
        assertThat(action.title()).isEqualTo("app_missing_container title");
    }

    @Test
    void backupRestorePointPromptWinsBeforePrivateAccessSetup() {
        RecommendedActionService service = service(
                summary(true, List.of(
                        issue("private", "info", "private_access_needs_setup"),
                        issue("backup", "info", "backup_enabled_no_restore_point"))),
                new InMemoryDismissals());

        RecommendedAction action = service.current();

        assertThat(action.id()).isEqualTo("backup");
    }

    @Test
    void dismissedWarningsAreSkippedButCriticalActionsRemainVisible() {
        InMemoryDismissals dismissals = new InMemoryDismissals();
        dismissals.dismiss("warning-app");
        dismissals.dismiss("critical-docker");

        RecommendedActionService warningService = service(
                summary(true, List.of(
                        issue("warning-app", "warning", "app_needs_attention"),
                        issue("backup", "info", "backup_enabled_no_restore_point"))),
                dismissals);
        RecommendedActionService criticalService = service(
                summary(true, List.of(
                        issue("critical-docker", "critical", "docker_unavailable"),
                        issue("backup", "info", "backup_enabled_no_restore_point"))),
                dismissals);

        assertThat(warningService.current().id()).isEqualTo("backup");
        assertThat(criticalService.current().id()).isEqualTo("critical-docker");
    }

    private RecommendedActionService service(SystemSummary summary, RecommendedActionDismissals dismissals) {
        return new RecommendedActionService(() -> summary, dismissals);
    }

    private SystemSummary summary(boolean setupComplete, List<ProjectOsIssue> issues) {
        return new SystemSummary(
                "Project OS",
                "instance-1",
                "http://localhost:8082",
                new SetupProgressSummary(setupComplete, setupComplete ? "complete" : "in_progress", setupComplete ? "done" : "host_check", setupComplete ? "Setup is complete." : "Setup is incomplete."),
                new DockerSummary(true, "Docker is ready."),
                new AccessSummary("local_only", "Local access is ready."),
                new AppsSummary(1, 1, 0, List.of()),
                new BackupSummary("needs_restore_point", "A restore point is needed."),
                new StorageSummary("ok", "Storage is available."),
                issues,
                Instant.parse("2026-06-21T12:00:00Z"));
    }

    private ProjectOsIssue issue(String id, String severity, String reasonCode) {
        return new ProjectOsIssue(
                id,
                "system",
                "",
                severity,
                reasonCode,
                reasonCode + " title",
                reasonCode + " summary",
                Optional.of(ProjectOsAction.route("open-" + id, "Open " + id, "/" + id)),
                List.of(),
                Map.of());
    }

    private static final class InMemoryDismissals implements RecommendedActionDismissals {
        private final Set<String> dismissed = new HashSet<>();

        @Override
        public boolean dismissed(String actionId) {
            return dismissed.contains(actionId);
        }

        @Override
        public void dismiss(String actionId) {
            dismissed.add(actionId);
        }
    }
}

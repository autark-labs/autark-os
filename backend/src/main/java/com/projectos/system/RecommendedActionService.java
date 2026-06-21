package com.projectos.system;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.projectos.api.ProjectOsAction;
import com.projectos.api.ProjectOsIssue;

@Service
public class RecommendedActionService implements RecommendedActionProvider {

    private final Supplier<SystemSummary> systemSummary;
    private final RecommendedActionDismissals dismissals;

    @Autowired
    public RecommendedActionService(SystemSummaryProvider systemSummaryProvider, RecommendedActionDismissals dismissals) {
        this((Supplier<SystemSummary>) systemSummaryProvider::summary, dismissals);
    }

    public RecommendedActionService(Supplier<SystemSummary> systemSummary, RecommendedActionDismissals dismissals) {
        this.systemSummary = systemSummary;
        this.dismissals = dismissals;
    }

    @Override
    public RecommendedAction current() {
        SystemSummary summary = systemSummary.get();
        if (!summary.setup().complete()) {
            return new RecommendedAction(
                    "complete-setup",
                    "warning",
                    "Finish Project OS setup",
                    summary.setup().summary(),
                    Optional.of(ProjectOsAction.route("open-setup", "Continue setup", "/setup")),
                    Optional.empty(),
                    List.of(),
                    false);
        }

        return summary.issues().stream()
                .sorted(Comparator.comparingInt(this::priority))
                .map(this::fromIssue)
                .filter(action -> !action.dismissible() || !dismissals.dismissed(action.id()))
                .findFirst()
                .orElseGet(this::none);
    }

    public void dismiss(String actionId) {
        dismissals.dismiss(actionId);
    }

    private RecommendedAction fromIssue(ProjectOsIssue issue) {
        boolean critical = "critical".equals(issue.severity());
        return new RecommendedAction(
                issue.id(),
                issue.severity(),
                issue.title(),
                issue.summary(),
                issue.primaryAction(),
                issue.secondaryActions().stream().findFirst(),
                List.of(issue.id()),
                !critical);
    }

    private int priority(ProjectOsIssue issue) {
        return switch (issue.reasonCode()) {
            case "docker_unavailable" -> 10;
            case "app_managed_elsewhere", "app_missing_container", "app_needs_attention" -> 20;
            case "backup_enabled_no_restore_point" -> 30;
            case "private_access_needs_setup" -> 40;
            default -> switch (issue.severity()) {
                case "critical" -> 15;
                case "warning" -> 50;
                case "info" -> 70;
                default -> 90;
            };
        };
    }

    private RecommendedAction none() {
        return new RecommendedAction(
                "no-action-needed",
                "success",
                "No action needed",
                "Project OS does not see anything that needs your attention right now.",
                Optional.empty(),
                Optional.empty(),
                List.of(),
                false);
    }
}

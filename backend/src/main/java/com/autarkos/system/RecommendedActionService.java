package com.autarkos.system;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.api.AutarkOsAction;
import com.autarkos.api.AutarkOsIssue;

@Service
public class RecommendedActionService implements RecommendedActionProvider {

    private final Supplier<SystemSummaryModels.SystemSummary> systemSummary;
    @Autowired
    public RecommendedActionService(SystemSummaryProvider systemSummaryProvider) {
        this((Supplier<SystemSummaryModels.SystemSummary>) systemSummaryProvider::summary);
    }

    public RecommendedActionService(Supplier<SystemSummaryModels.SystemSummary> systemSummary) {
        this.systemSummary = systemSummary;
    }

    @Override
    public RecommendedAction current() {
        SystemSummaryModels.SystemSummary summary = systemSummary.get();
        if (!summary.setup().complete()) {
            return new RecommendedAction(
                    "complete-setup",
                    "warning",
                    "Finish Autark-OS setup",
                    summary.setup().summary(),
                    Optional.of(AutarkOsAction.route("open-setup", "Continue setup", "/setup")),
                    Optional.empty(),
                    List.of());
        }

        return summary.issues().stream()
                .sorted(Comparator.comparingInt(this::priority))
                .map(this::fromIssue)
                .findFirst()
                .orElseGet(this::none);
    }

    private RecommendedAction fromIssue(AutarkOsIssue issue) {
        return new RecommendedAction(
                issue.id(),
                issue.severity(),
                issue.title(),
                issue.summary(),
                issue.primaryAction(),
                issue.secondaryActions().stream().findFirst(),
                List.of(issue.id()));
    }

    private int priority(AutarkOsIssue issue) {
        return switch (issue.reasonCode()) {
            case "docker_unavailable" -> 10;
            case "app_managed_elsewhere", "app_missing_container", "app_needs_attention" -> 20;
            case AutarkOsStates.BackupState.ENABLED_NO_RESTORE_POINT -> 30;
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
                "Autark-OS does not see anything that needs your attention right now.",
                Optional.empty(),
                Optional.empty(),
                List.of());
    }
}

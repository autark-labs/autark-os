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
    private final List<RecommendedActionContributor> contributors;

    @Autowired
    public RecommendedActionService(
            SystemSummaryProvider systemSummaryProvider,
            List<RecommendedActionContributor> contributors) {
        this(
                (Supplier<SystemSummaryModels.SystemSummary>)
                        systemSummaryProvider::summary,
                contributors);
    }

    public RecommendedActionService(Supplier<SystemSummaryModels.SystemSummary> systemSummary) {
        this(systemSummary, List.of());
    }

    RecommendedActionService(
            Supplier<SystemSummaryModels.SystemSummary> systemSummary,
            List<RecommendedActionContributor> contributors) {
        this.systemSummary = systemSummary;
        this.contributors =
                contributors == null
                        ? List.of()
                        : List.copyOf(contributors);
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

        Optional<RecommendationCandidate> ce =
                summary.issues().stream()
                .sorted(Comparator.comparingInt(this::priority))
                .findFirst()
                .map(issue -> new RecommendationCandidate(
                        priority(issue),
                        fromIssue(issue)));
        Optional<RecommendationCandidate> contributed =
                contributors.stream()
                        .map(this::safeContribution)
                        .flatMap(Optional::stream)
                        .map(value -> new RecommendationCandidate(
                                value.priority(),
                                value.action()))
                        .min(Comparator.comparingInt(
                                RecommendationCandidate::priority));
        return java.util.stream.Stream.of(ce, contributed)
                .flatMap(Optional::stream)
                .min(Comparator.comparingInt(
                        RecommendationCandidate::priority))
                .map(RecommendationCandidate::action)
                .orElseGet(this::none);
    }

    private Optional<RecommendedActionContribution>
            safeContribution(
                    RecommendedActionContributor contributor) {
        try {
            return contributor.current();
        } catch (RuntimeException exception) {
            return Optional.empty();
        }
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

    private record RecommendationCandidate(
            int priority,
            RecommendedAction action) {
    }
}

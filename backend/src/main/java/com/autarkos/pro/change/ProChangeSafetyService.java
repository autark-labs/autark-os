package com.autarkos.pro.change;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.autarkos.marketplace.install.models.UpdateModels;
import com.autarkos.pro.agent.ProAgentClientException;
import com.autarkos.pro.agent.ProAgentClientRouter;
import com.autarkos.pro.snapshot.NormalizedHostSnapshotAssembler;

@Service
public final class ProChangeSafetyService {

    private static final Duration MAX_ANALYSIS_LIFETIME = Duration.ofMinutes(15);
    private static final Set<String> OUTCOMES = Set.of("proceed", "protect_first", "defer", "blocked");

    private final ProAgentClientRouter agent;
    private final NormalizedHostSnapshotAssembler snapshots;

    public ProChangeSafetyService(
            ProAgentClientRouter agent,
            NormalizedHostSnapshotAssembler snapshots) {
        this.agent = agent;
        this.snapshots = snapshots;
    }

    public UpdateModels.ChangeSafetyAdvice assess(UpdateModels.AppUpdatePlan plan) {
        if (plan == null || !plan.canApply() || !"update".equals(plan.operation())
                || agent.activeEndpoint().isEmpty()) {
            return UpdateModels.ChangeSafetyAdvice.unavailable();
        }
        try {
            NormalizedHostSnapshotAssembler.TargetedSnapshot targeted = snapshots.assembleForApp(plan.appId());
            if (targeted.resourceRef() == null) {
                return UpdateModels.ChangeSafetyAdvice.unavailable();
            }
            ProChangeSafetyResponse response = agent.changeSafety(new ProChangeSafetyRequest(
                    "1",
                    plan.planId(),
                    plan.operation(),
                    targeted.resourceRef(),
                    plan.currentVersion(),
                    plan.targetVersion(),
                    plan.changes(),
                    plan.safetyBackupRequired(),
                    targeted.snapshot()));
            requireBoundResponse(plan, targeted, response);
            return new UpdateModels.ChangeSafetyAdvice(
                    "ready",
                    response.outcome(),
                    response.headline(),
                    response.summary(),
                    List.copyOf(response.reasons()),
                    response.analyzedAt(),
                    response.expiresAt());
        } catch (RuntimeException exception) {
            return UpdateModels.ChangeSafetyAdvice.unavailable();
        }
    }

    private void requireBoundResponse(
            UpdateModels.AppUpdatePlan plan,
            NormalizedHostSnapshotAssembler.TargetedSnapshot targeted,
            ProChangeSafetyResponse response) {
        Instant now = Instant.now();
        if (response == null
                || !"1".equals(response.schemaVersion())
                || !plan.planId().equals(response.planId())
                || !targeted.snapshot().snapshotId().equals(response.analyzedSnapshotId())
                || !targeted.resourceRef().equals(response.targetResourceRef())
                || !OUTCOMES.contains(response.outcome())
                || !boundedText(response.headline(), 160)
                || !boundedText(response.summary(), 1000)
                || response.reasons() == null
                || response.reasons().size() > 12
                || response.reasons().stream().anyMatch(reason -> !boundedText(reason, 500))
                || response.analyzedAt() == null
                || response.expiresAt() == null
                || response.analyzedAt().isBefore(targeted.snapshot().generatedAt().minusSeconds(5))
                || response.analyzedAt().isAfter(now.plusSeconds(30))
                || !response.expiresAt().isAfter(now)
                || response.expiresAt().isAfter(response.analyzedAt().plus(MAX_ANALYSIS_LIFETIME))) {
            throw new ProAgentClientException(
                    "agent_response_invalid",
                    "Autark Pro returned invalid change guidance.");
        }
    }

    private boolean boundedText(String value, int maximumLength) {
        return value != null && !value.isBlank() && value.length() <= maximumLength;
    }
}

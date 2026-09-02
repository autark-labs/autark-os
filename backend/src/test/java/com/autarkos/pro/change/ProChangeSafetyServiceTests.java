package com.autarkos.pro.change;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.autarkos.marketplace.install.models.UpdateModels;
import com.autarkos.pro.agent.ProAgentClientRouter;
import com.autarkos.pro.agent.ProAgentEndpoint;
import com.autarkos.pro.model.NormalizedHostSnapshot;
import com.autarkos.pro.snapshot.NormalizedHostSnapshotAssembler;

class ProChangeSafetyServiceTests {

    private static final String PLAN_ID = "sha256:" + "a".repeat(64);
    private static final String SNAPSHOT_ID = "11111111-1111-4111-8111-111111111111";
    private static final String RESOURCE_REF = "app:target";

    @Test
    void leavesTheOrdinaryCePlanAvailableWhenProIsAbsent() {
        ProAgentClientRouter agent = mock(ProAgentClientRouter.class);
        NormalizedHostSnapshotAssembler snapshots = mock(NormalizedHostSnapshotAssembler.class);
        when(agent.activeEndpoint()).thenReturn(Optional.empty());

        UpdateModels.ChangeSafetyAdvice advice = new ProChangeSafetyService(agent, snapshots).assess(plan());

        assertThat(advice.state()).isEqualTo("unavailable");
        verify(snapshots, never()).assembleForApp("vaultwarden");
    }

    @Test
    void acceptsOnlyGuidanceBoundToTheExactPlanSnapshotAndTarget() {
        Instant now = Instant.now();
        ProAgentClientRouter agent = mock(ProAgentClientRouter.class);
        NormalizedHostSnapshotAssembler snapshots = mock(NormalizedHostSnapshotAssembler.class);
        NormalizedHostSnapshot snapshot = snapshot(now);
        when(agent.activeEndpoint()).thenReturn(Optional.of(mock(ProAgentEndpoint.class)));
        when(snapshots.assembleForApp("vaultwarden"))
                .thenReturn(new NormalizedHostSnapshotAssembler.TargetedSnapshot(snapshot, RESOURCE_REF));
        when(agent.changeSafety(org.mockito.ArgumentMatchers.any()))
                .thenReturn(new ProChangeSafetyResponse(
                        "1",
                        PLAN_ID,
                        SNAPSHOT_ID,
                        RESOURCE_REF,
                        "protect_first",
                        "Create protection first",
                        "Guardian will verify the checkpoint before the update applies.",
                        List.of("The update job creates the checkpoint."),
                        now.plusSeconds(1),
                        now.plusSeconds(301)));

        UpdateModels.ChangeSafetyAdvice advice = new ProChangeSafetyService(agent, snapshots).assess(plan());

        assertThat(advice.state()).isEqualTo("ready");
        assertThat(advice.outcome()).isEqualTo("protect_first");
        verify(agent).changeSafety(org.mockito.ArgumentMatchers.argThat(request ->
                PLAN_ID.equals(request.planId())
                        && SNAPSHOT_ID.equals(request.snapshot().snapshotId())
                        && RESOURCE_REF.equals(request.targetResourceRef())));
    }

    @Test
    void rejectsMismatchedAgentGuidanceAndFallsBackToCeProtection() {
        Instant now = Instant.now();
        ProAgentClientRouter agent = mock(ProAgentClientRouter.class);
        NormalizedHostSnapshotAssembler snapshots = mock(NormalizedHostSnapshotAssembler.class);
        when(agent.activeEndpoint()).thenReturn(Optional.of(mock(ProAgentEndpoint.class)));
        when(snapshots.assembleForApp("vaultwarden"))
                .thenReturn(new NormalizedHostSnapshotAssembler.TargetedSnapshot(snapshot(now), RESOURCE_REF));
        when(agent.changeSafety(org.mockito.ArgumentMatchers.any()))
                .thenReturn(new ProChangeSafetyResponse(
                        "1",
                        "sha256:" + "b".repeat(64),
                        SNAPSHOT_ID,
                        RESOURCE_REF,
                        "proceed",
                        "Ready",
                        "Ready",
                        List.of(),
                        now,
                        now.plusSeconds(300)));

        UpdateModels.ChangeSafetyAdvice advice = new ProChangeSafetyService(agent, snapshots).assess(plan());

        assertThat(advice.state()).isEqualTo("unavailable");
        assertThat(plan().withGuardianAdvice(advice).canApply()).isTrue();
    }

    private UpdateModels.AppUpdatePlan plan() {
        return new UpdateModels.AppUpdatePlan(
                "vaultwarden",
                "Vaultwarden",
                "update",
                PLAN_ID,
                "available",
                "Update ready to review",
                "A verified safety checkpoint will be created.",
                "1.0.0",
                "1.1.0",
                true,
                true,
                false,
                "",
                List.of("Create verified safety checkpoint"),
                List.of(),
                UpdateModels.ChangeSafetyAdvice.unavailable(),
                Instant.now());
    }

    private NormalizedHostSnapshot snapshot(Instant now) {
        return new NormalizedHostSnapshot(
                "1",
                SNAPSHOT_ID,
                now,
                new NormalizedHostSnapshot.SystemSnapshot("1.0.0", "linux/arm64", "available", "available"),
                List.of(new NormalizedHostSnapshot.AppSnapshot(RESOURCE_REF, "Vaultwarden", "running", "available", true, 0, 0, null)),
                new NormalizedHostSnapshot.FoundServicesSnapshot(0, 0, 0, 0, List.of()),
                List.of(),
                new NormalizedHostSnapshot.BackupSnapshot(
                        "available",
                        new NormalizedHostSnapshot.BackupDestinationSnapshot("backup-destination:primary", "available"),
                        List.of()),
                new NormalizedHostSnapshot.StorageSnapshot("available", 100L, 20L, 10L, 50L, 5L, null, List.of(), 0L),
                new NormalizedHostSnapshot.MetricsSnapshot("available", 1.0, 2.0, 20.0),
                List.of(),
                List.of(),
                List.of(),
                false);
    }
}

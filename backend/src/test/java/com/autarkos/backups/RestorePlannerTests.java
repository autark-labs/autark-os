package com.autarkos.backups;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

import com.autarkos.marketplace.install.InstalledApp;

class RestorePlannerTests {
    @Test
    void fullRestoreCannotSilentlyDropAnUninstalledArchiveMember() {
        var fixture = new Fixture("homepage,removed-app");
        var plan = fixture.planner.restorePlan(42L, null);
        assertThat(plan.executable()).isFalse();
        assertThat(plan.blockedReasons()).anyMatch(message -> message.contains("removed-app"));
        assertThat(plan.apps()).extracting(RestoreModels.RestorePlanApp::status).containsExactly("restorable", "missing");
        verify(fixture.simulation, never()).simulateRestore(any(), anyList());

        var subset = fixture.planner.restorePlan(42L, "homepage");
        assertThat(subset.executable()).isTrue();
        assertThat(subset.affectedApps()).containsExactly("Homepage");
        assertThat(subset.apps()).extracting(RestoreModels.RestorePlanApp::status).containsExactly("restorable", "excluded");
        assertThat(subset.warnings()).anyMatch(message -> message.contains("one at a time"));
    }

    @Test
    void replacedAppIdentityRequiresRenewedReviewBeforeApply() {
        var fixture = new Fixture("homepage");
        var reviewed = fixture.planner.restorePlan(42L, null);
        fixture.identity.set(List.of("replacement-instance", "/changed-data"));
        assertThatThrownBy(() -> fixture.planner.requireReviewed(42L, null, reviewed.planId())).hasMessageContaining("scope changed");
    }

    @Test
    void changedArchiveIntegrityBlocksThePreviouslyReviewedOperation() {
        var fixture = new Fixture("homepage");
        var reviewed = fixture.planner.restorePlan(42L, null);
        when(fixture.verification.restoreIntegrity(any())).thenReturn(BackupVerificationService.IntegrityCheck.blocked("Archive checksum changed."));
        assertThatThrownBy(() -> fixture.planner.requireReviewed(42L, null, reviewed.planId())).hasMessageContaining("Archive checksum changed");
    }

    @Test
    void reviewIsBoundToSelectionAndNewReviewGetsANewReplayIdentity() {
        var fixture = new Fixture("homepage");
        var reviewed = fixture.planner.restorePlan(42L, null);
        assertThat(fixture.planner.requireReviewed(42L, null, reviewed.planId()).executable()).isTrue();
        assertThat(reviewed.jobId()).isEqualTo(com.autarkos.jobs.AutarkOsJobService.onceJobId(
                "review:" + RestorePlanner.reviewKey(42L, null, reviewed.planId())));
        assertThat(fixture.planner.restorePlan(42L, null).planId()).isNotEqualTo(reviewed.planId());
        assertThatThrownBy(() -> fixture.planner.requireReviewed(42L, "homepage", reviewed.planId())).hasMessageContaining("Review the restore plan again");
        assertThatThrownBy(() -> fixture.planner.requireReviewed(42L, null, null)).hasMessageContaining("Review the restore plan before");
    }

    private static class Fixture {
        final BackupRepository repository = mock(BackupRepository.class);
        final BackupVerificationService verification = mock(BackupVerificationService.class);
        final RestoreSimulationService simulation = mock(RestoreSimulationService.class);
        final AtomicReference<List<String>> identity = new AtomicReference<>(List.of("original-instance", "/original-data"));
        final RestorePlanner planner;

        Fixture(String included) {
            var contracts = mock(BackupContractService.class);
            var app = new InstalledApp("homepage", "Homepage", "Ready", "/apps/homepage", "homepage", "", Instant.now());
            var entity = RestorePoints.create("__full__", "All apps", "full", "manual", included, "/backups/full.zip",
                    "completed", 10, "Backup", "a".repeat(64), "cold_file", 1);
            entity.updateVerification("verified", "Verified", "high", Instant.now().toString());
            org.springframework.test.util.ReflectionTestUtils.setField(entity, "id", 42L);
            when(repository.findById(42L)).thenReturn(Optional.of(entity));
            when(contracts.backupContract(app)).thenReturn(new BackupModels.BackupContract("cold_file", 1, "Stopped app backup", "high", false, "Ready", List.of()));
            when(contracts.compatible(any(), any())).thenReturn(true);
            when(verification.restoreIntegrity(any())).thenReturn(BackupVerificationService.IntegrityCheck.ready());
            when(simulation.simulateRestore(any(), anyList())).thenReturn(new RestoreModels.RestoreSimulationResult("passed", "Passed", List.of(), Instant.now()));
            planner = new RestorePlanner(repository, contracts, verification, simulation, () -> List.of(app), ignored -> true,
                    ignored -> "", ignored -> identity.get());
        }
    }
}

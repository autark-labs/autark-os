package com.autarkos.backups;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;

class BackupRepositoryTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void recordsQueriesAndUpdatesRestorePoints() {
        BackupRepository repository = repository();

        String baseline = "a".repeat(64);
        RestorePointEntity point = repository.save(RestorePoints.create("vaultwarden", "Vaultwarden", "app", "manual", "vaultwarden", "/backups/vaultwarden.tar", "completed", 1024, "Backup completed.", baseline, "cold_file", 1));
        point.updateVerification("verified", "Archive checksum matched.", "high", "2026-06-20T12:00:00Z");
        repository.save(point);

        RestorePoint found = repository.findById(point.id()).map(RestorePoints::toDomain).orElseThrow();

        assertThat(found.appId()).isEqualTo("vaultwarden");
        assertThat(found.scope()).isEqualTo("app");
        assertThat(found.source()).isEqualTo("manual");
        assertThat(found.sizeBytes()).isEqualTo(1024);
        assertThat(found.verificationStatus()).isEqualTo("verified");
        assertThat(found.checksumSha256()).isEqualTo(baseline);
        assertThat(found.integrityBaselineSha256()).isEqualTo(baseline);
        assertThat(found.backupContractStrategy()).isEqualTo("cold_file");
        assertThat(found.restoreConfidence()).isEqualTo("high");
        assertThat(found.verifiedAt()).isNotNull();
        assertThat(repository.forApp("vaultwarden", 10)).hasSize(1);
        assertThat(repository.recent(10).stream().map(RestorePoints::toDomain))
                .extracting(RestorePoint::appName)
                .containsExactly("Vaultwarden");
    }

    @Test
    void routineAndVerificationSummariesSurviveMoreThanTwentyManualPoints() {
        BackupRepository repository = repository();
        var success = repository.save(RestorePoints.create("__full__", "All apps", "full", "automatic", "homepage",
                "/backups/routine.zip", "completed", 1, "Routine completed", "a".repeat(64), "cold_file", 1));
        success.updateVerification("verified", "Verified", "high", "2026-10-10T12:00:00Z");
        repository.save(success);
        var failure = repository.save(RestorePoints.create("__full__", "All apps", "full", "automatic", "homepage",
                "", "failed", 0, "Routine failed", "", "cold_file", 1));
        var newerArchive = repository.save(RestorePoints.create("homepage", "Homepage", "app", "manual", "homepage",
                "/backups/manual.zip", "completed", 1, "Manual completed", "b".repeat(64), "cold_file", 1));
        newerArchive.updateVerification("verified", "Verified earlier", "high", "2026-10-09T12:00:00Z");
        repository.save(newerArchive);
        for (int i = 0; i < 25; i++) {
            repository.save(RestorePoints.create("homepage", "Homepage", "app", "manual", "homepage",
                    "", "failed", 0, "Manual failure", "", "cold_file", 1));
        }
        assertThat(repository.recent(20)).extracting(RestorePointEntity::source).containsOnly("manual");
        assertThat(repository.latestRoutine(false)).map(RestorePointEntity::id).contains(failure.id());
        assertThat(repository.latestRoutine(true)).map(RestorePointEntity::id).contains(success.id());
        assertThat(repository.latestSuccessfulVerification()).map(RestorePointEntity::id).contains(success.id());
    }

    @Test
    void archivePagesRetainRemovedAppsBeyondTheRecentReportAndMatchFullMembership() {
        var repository = repository();
        var old = repository.save(RestorePoints.create("removed-app", "Removed app", "app", "manual", "removed-app", "/retained.zip", "completed", 1, "Retained"));
        var full = repository.save(RestorePoints.create("__full__", "All apps", "full", "manual", "removed-app,homepage", "/full.zip", "completed", 1, "Full"));
        for (int index = 0; index < 60; index++) repository.save(RestorePoints.create("homepage", "Homepage", "app", "manual", "homepage", "/new.zip", "completed", 1, "Newer"));
        assertThat(repository.recent(20)).extracting(RestorePointEntity::id).doesNotContain(old.id());
        var page = repository.archivePage(null, null);
        assertThat(page).hasSize(51);
        var next = repository.archivePage(page.get(49).id(), null);
        assertThat(next).hasSize(12).extracting(RestorePointEntity::id).contains(old.id(), full.id());
        assertThat(repository.archivePage(null, "removed-app")).extracting(RestorePointEntity::id).containsExactly(full.id(), old.id());
        assertThat(repository.archivePage(null, "removed")).isEmpty();
    }

    private BackupRepository repository() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return JpaTestRepositories.backupRepository(new RuntimeLayout(properties));
    }

    @Test
    void includesFullPointsWithExactAppMembershipAndNoRecentHistoryCutoff() {
        BackupRepository repository = repository();
        var full = repository.save(RestorePoints.create("__full__", "All apps", "full", "manual", "homepage, syncthing",
                "/backups/full.zip", "completed", 1, "Full backup", "a".repeat(64), "cold_file", 1));
        for (int i = 0; i < 12; i++) {
            repository.save(RestorePoints.create("homepage", "Homepage", "app", "manual", "homepage",
                    "", "failed", 0, "Failed", "", "cold_file", 1));
        }
        assertThat(repository.containingApp("homepage")).hasSize(13);
        assertThat(repository.containingApp("syncthing")).extracting(RestorePointEntity::id).containsExactly(full.id());
        assertThat(repository.containingApp("home")).isEmpty();
        assertThat(repository.containingApp("vaultwarden")).isEmpty();
    }
}

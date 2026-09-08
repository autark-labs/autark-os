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

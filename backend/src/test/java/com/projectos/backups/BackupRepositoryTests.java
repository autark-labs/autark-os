package com.projectos.backups;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

class BackupRepositoryTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void recordsQueriesAndUpdatesRestorePoints() {
        BackupRepository repository = new BackupRepository(runtimeLayout());

        RestorePoint point = repository.record("vaultwarden", "Vaultwarden", "app", "manual", "vaultwarden", "/backups/vaultwarden.tar", "completed", 1024, "Backup completed.");
        RestorePoint verified = repository.updateVerification(point.id(), "verified", "Archive checksum matched.", "abc123", "high");

        assertThat(repository.findById(point.id()))
                .satisfies(found -> {
                    assertThat(found.appId()).isEqualTo("vaultwarden");
                    assertThat(found.scope()).isEqualTo("app");
                    assertThat(found.source()).isEqualTo("manual");
                    assertThat(found.sizeBytes()).isEqualTo(1024);
                    assertThat(found.verificationStatus()).isEqualTo("verified");
                    assertThat(found.checksumSha256()).isEqualTo("abc123");
                    assertThat(found.restoreConfidence()).isEqualTo("high");
                    assertThat(found.verifiedAt()).isNotNull();
                });
        assertThat(verified.verificationMessage()).isEqualTo("Archive checksum matched.");
        assertThat(repository.forApp("vaultwarden", 10)).hasSize(1);
        assertThat(repository.recent(10)).extracting(RestorePoint::appName).containsExactly("Vaultwarden");
    }

    private RuntimeLayout runtimeLayout() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}

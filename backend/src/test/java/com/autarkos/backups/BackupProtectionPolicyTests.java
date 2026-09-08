package com.autarkos.backups;

import static org.assertj.core.api.Assertions.assertThat;
import java.util.List;
import org.junit.jupiter.api.Test;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;

class BackupProtectionPolicyTests {
    private final MarketplaceCatalogService catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());

    @Test
    void onlySupportedCompatibleVerifiedPointsProvideProtection() {
        var homepage = catalog.findById("homepage").orElseThrow();
        var valid = point("full", "homepage,syncthing", "a".repeat(64), "cold_file", 1, "verified");
        assertThat(BackupProtectionPolicy.state(true, homepage, List.of(valid))).isEqualTo("protected_by_restore_point");
        for (var invalid : List.of(
                point("full", "homepage-other", "a".repeat(64), "cold_file", 1, "verified"),
                point("full", "homepage", "", "cold_file", 1, "verified"),
                point("full", "homepage", "a".repeat(64), "cold_file", 2, "verified"),
                point("full", "homepage", "a".repeat(64), "sqlite_aware", 1, "verified"),
                point("full", "homepage", "a".repeat(64), "cold_file", 1, "not_checked"))) {
            assertThat(BackupProtectionPolicy.state(true, homepage, List.of(invalid))).isEqualTo("backup_enabled_no_restore_point");
            assertThat(BackupProtectionPolicy.state(true, homepage, List.of(invalid, valid))).isEqualTo("protected_by_restore_point");
        }
        var unsupported = catalog.findById("vaultwarden").orElseThrow();
        assertThat(BackupProtectionPolicy.state(true, unsupported,
                List.of(point("full", "vaultwarden", "a".repeat(64), "cold_file", 1, "verified"))))
                .isEqualTo("backup_enabled_no_restore_point");
        assertThat(BackupProtectionPolicy.state(false, homepage, List.of(valid))).isEqualTo("backup_disabled");
        assertThat(BackupProtectionPolicy.state(true, null, List.of(valid))).isEqualTo("backup_enabled_no_restore_point");
    }

    private RestorePoint point(String scope, String included, String baseline, String strategy, int version, String verification) {
        var entity = RestorePoints.create("__full__", "All apps", scope, "manual", included,
                "/backup.zip", "completed", 1, "Checkpoint", baseline, strategy, version);
        entity.updateVerification(verification, "Verification result", "high", "2026-06-20T12:00:00Z");
        return RestorePoints.toDomain(entity);
    }
}

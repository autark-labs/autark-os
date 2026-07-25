package com.autarkos.extensions;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.sql.Connection;
import java.time.Instant;
import java.util.Set;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.sqlite.SQLiteDataSource;

class ExtensionStateStoreTests {

    private static final String EXTENSION_ID = "autark-pro";
    private static final String ACTIVE_DIGEST =
            "sha256:" + "a".repeat(64);
    private static final String PREVIOUS_DIGEST =
            "sha256:" + "b".repeat(64);
    private static final String EXPIRED_DIGEST =
            "sha256:" + "c".repeat(64);

    @TempDir
    Path directory;

    @Test
    void usesOneSchemaVersionedStatePerDigestAndResetsLegacyScopes()
            throws Exception {
        SQLiteDataSource dataSource = dataSource();
        ExtensionStateStore store = new ExtensionStateStore(dataSource);
        store.saveCanonical(
                EXTENSION_ID,
                ACTIVE_DIGEST,
                1,
                "canonical_state");
        insertLegacySurfaceState(dataSource, ACTIVE_DIGEST);

        assertThat(store.loadCanonical(EXTENSION_ID, ACTIVE_DIGEST))
                .contains(new ExtensionStateStore.ExtensionState(
                        "canonical_state", 1));
        assertThat(store.hasLegacySurfaceState(
                EXTENSION_ID, ACTIVE_DIGEST)).isTrue();

        store.resetLegacySurfaceState(EXTENSION_ID, ACTIVE_DIGEST);

        assertThat(store.hasLegacySurfaceState(
                EXTENSION_ID, ACTIVE_DIGEST)).isFalse();
        assertThat(store.loadCanonical(EXTENSION_ID, ACTIVE_DIGEST))
                .isPresent();
    }

    @Test
    void retainsActiveAndPreviousDigestsUntilTheyAgeOutOfRetention()
            throws Exception {
        SQLiteDataSource dataSource = dataSource();
        ExtensionStateStore store = new ExtensionStateStore(dataSource);
        store.saveCanonical(
                EXTENSION_ID,
                ACTIVE_DIGEST,
                1,
                "active_state");
        store.saveCanonical(
                EXTENSION_ID,
                PREVIOUS_DIGEST,
                1,
                "previous_state");
        store.saveCanonical(
                EXTENSION_ID,
                EXPIRED_DIGEST,
                1,
                "expired_state");
        setUpdatedAt(dataSource, EXPIRED_DIGEST,
                Instant.parse("2026-01-01T00:00:00Z"));

        store.cleanupExpired(
                EXTENSION_ID,
                Set.of(ACTIVE_DIGEST, PREVIOUS_DIGEST),
                Instant.parse("2026-07-01T00:00:00Z"));

        assertThat(store.loadCanonical(EXTENSION_ID, ACTIVE_DIGEST))
                .isPresent();
        assertThat(store.loadCanonical(EXTENSION_ID, PREVIOUS_DIGEST))
                .isPresent();
        assertThat(store.loadCanonical(EXTENSION_ID, EXPIRED_DIGEST))
                .isEmpty();
    }

    private SQLiteDataSource dataSource() {
        String url = "jdbc:sqlite:" + directory.resolve("autark-os.db");
        Flyway.configure()
                .dataSource(url, null, null)
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .load()
                .migrate();
        SQLiteDataSource dataSource = new SQLiteDataSource();
        dataSource.setUrl(url);
        return dataSource;
    }

    private static void insertLegacySurfaceState(
            SQLiteDataSource dataSource,
            String digest) throws Exception {
        try (Connection connection = dataSource.getConnection();
                var statement = connection.prepareStatement("""
                        insert into extension_state(
                            extension_id,
                            component_digest,
                            scope,
                            state_schema_version,
                            opaque_state,
                            updated_at
                        ) values (?, ?, ?, ?, ?, ?)
                        """)) {
            statement.setString(1, EXTENSION_ID);
            statement.setString(2, digest);
            statement.setString(3, "storage.insights");
            statement.setInt(4, 1);
            statement.setString(5, "legacy_state");
            statement.setString(6, Instant.parse("2026-07-19T00:00:00Z")
                    .toString());
            statement.executeUpdate();
        }
    }

    private static void setUpdatedAt(
            SQLiteDataSource dataSource,
            String digest,
            Instant updatedAt) throws Exception {
        try (Connection connection = dataSource.getConnection();
                var statement = connection.prepareStatement("""
                        update extension_state
                        set updated_at = ?
                        where extension_id = ? and component_digest = ?
                        """)) {
            statement.setString(1, updatedAt.toString());
            statement.setString(2, EXTENSION_ID);
            statement.setString(3, digest);
            statement.executeUpdate();
        }
    }
}

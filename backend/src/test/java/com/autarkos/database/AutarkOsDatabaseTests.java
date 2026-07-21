package com.autarkos.database;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Locale;
import java.util.Set;

import javax.sql.DataSource;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.flywaydb.core.Flyway;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;

class AutarkOsDatabaseTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void migratesRuntimeDatabaseWithFlywayAndExposesConnections() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        AutarkOsDatabase database = new AutarkOsDatabase(runtimeLayout);

        database.migrate();

        assertThat(Files.exists(runtimeLayout.databasePath())).isTrue();
        try (Connection connection = database.connection(); Statement statement = connection.createStatement()) {
            assertThat(tableExists(statement, "flyway_schema_history")).isTrue();
            assertThat(tableExists(statement, "activity_logs")).isTrue();
            assertThat(tableExists(statement, "installed_apps")).isTrue();
            assertThat(tableExists(statement, "project_settings")).isTrue();
            assertThat(columnExists(statement, "installed_app_settings", "private_access_url")).isTrue();
            assertThat(columnExists(statement, "installed_app_settings", "auto_repair_enabled")).isTrue();
            assertThat(columnExists(statement, "installed_apps", "app_instance_id")).isTrue();
            assertThat(columnExists(statement, "installed_apps", "catalog_app_id")).isTrue();
            assertThat(columnExists(statement, "installed_apps", "autark_os_instance_id")).isTrue();
            assertThat(columnExists(statement, "installed_apps", "runtime_path_or_hash")).isTrue();
            assertThat(columnExists(statement, "installed_apps", "install_state")).isTrue();
            assertThat(columnExists(statement, "installed_apps", "ownership_status")).isTrue();
            assertThat(columnExists(statement, "installed_apps", "created_at")).isTrue();
            assertThat(columnExists(statement, "installed_apps", "updated_at")).isTrue();
            assertThat(columnExists(statement, "app_health", "startup_grace")).isTrue();
            assertThat(columnExists(statement, "app_backups", "restore_confidence")).isTrue();
            assertThat(tableExists(statement, "pro_entitlement_cache")).isTrue();
            assertThat(tableExists(statement, "pro_release_state")).isTrue();
            assertThat(tableExists(statement, "pro_release_history")).isTrue();
            assertThat(tableExists(statement, "extension_state")).isTrue();
            assertThat(columnExists(
                    statement,
                    "extension_state",
                    "opaque_state")).isTrue();
            assertThat(tableExists(
                    statement,
                    "pro_guardian_analysis_runs")).isFalse();
            assertThat(tableExists(
                    statement,
                    "pro_guardian_findings")).isFalse();
        }
        if (Files.getFileStore(runtimeLayout.databasePath())
                .supportsFileAttributeView("posix")) {
            assertThat(Files.getPosixFilePermissions(runtimeLayout.databasePath()))
                    .isEqualTo(Set.of(
                            PosixFilePermission.OWNER_READ,
                            PosixFilePermission.OWNER_WRITE));
        }
    }

    @Test
    void configuredDataSourceBoundsConcurrentWriterWaits() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        AutarkOsDatabase database = new AutarkOsDatabase(runtimeLayout);
        DataSource dataSource = new AutarkOsDataSourceConfiguration()
                .dataSource(runtimeLayout, database);

        try (Connection connection = dataSource.getConnection();
                Statement statement = connection.createStatement();
                ResultSet result =
                        statement.executeQuery("pragma busy_timeout")) {
            assertThat(result.next()).isTrue();
            assertThat(result.getInt(1))
                    .isEqualTo(
                            AutarkOsDataSourceConfiguration
                                    .SQLITE_BUSY_TIMEOUT_MILLIS);
        }
    }

    @Test
    void autarkOsDatabaseDoesNotRepairSchemaOutsideFlyway() throws Exception {
        Path source = Path.of("src/main/java/com/autarkos/database/AutarkOsDatabase.java");
        String databaseSource = Files.readString(source).toLowerCase(Locale.ROOT);

        assertThat(databaseSource)
                .doesNotContain("ensurecolumn")
                .doesNotContain("alter table");
    }

    @Test
    void rejectsUnboundedOrUnredactedProRefreshMetadata() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        AutarkOsDatabase database = new AutarkOsDatabase(runtimeLayout);
        database.migrate();

        try (Connection connection = database.connection();
                Statement statement = connection.createStatement()) {
            statement.executeUpdate("""
                    insert into pro_entitlement_cache(
                        cache_id,
                        schema_version,
                        consecutive_failures,
                        created_at,
                        updated_at
                    ) values (
                        1,
                        '1',
                        0,
                        '2026-07-19T12:00:00Z',
                        '2026-07-19T12:00:00Z'
                    )
                    """);

            assertThatThrownBy(() -> statement.executeUpdate("""
                    update pro_entitlement_cache
                    set last_failure_category = 'remote-message',
                        consecutive_failures = 31
                    where cache_id = 1
                    """))
                    .isInstanceOf(java.sql.SQLException.class)
                    .hasMessageContaining(
                            "invalid Pro entitlement refresh metadata");
        }
    }

    @Test
    void removesPersistedProTablesWhenUpgradingToTheFreeRelease() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        String jdbcUrl = "jdbc:sqlite:" + runtimeLayout.databasePath();

        Flyway.configure()
                .dataSource(jdbcUrl, null, null)
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .target("14")
                .load()
                .migrate();

        try (Connection connection = java.sql.DriverManager.getConnection(jdbcUrl); Statement statement = connection.createStatement()) {
            assertThat(tableExists(statement, "pro_settings")).isTrue();
            assertThat(tableExists(statement, "pro_feed_cache")).isTrue();
            assertThat(tableExists(statement, "pro_notifications")).isTrue();
            assertThat(tableExists(statement, "pro_mobile_pairing")).isTrue();
        }

        new AutarkOsDatabase(runtimeLayout).migrate();

        try (Connection connection = java.sql.DriverManager.getConnection(jdbcUrl); Statement statement = connection.createStatement()) {
            assertThat(tableExists(statement, "pro_settings")).isFalse();
            assertThat(tableExists(statement, "pro_feed_cache")).isFalse();
            assertThat(tableExists(statement, "pro_notifications")).isFalse();
            assertThat(tableExists(statement, "pro_mobile_pairing")).isFalse();
        }
    }

    private boolean tableExists(Statement statement, String tableName) throws Exception {
        try (ResultSet resultSet = statement.executeQuery("select name from sqlite_master where type = 'table' and name = '" + tableName + "'")) {
            return resultSet.next();
        }
    }

    private boolean columnExists(Statement statement, String tableName, String columnName) throws Exception {
        try (ResultSet resultSet = statement.executeQuery("pragma table_info(" + tableName + ")")) {
            while (resultSet.next()) {
                if (columnName.equals(resultSet.getString("name"))) {
                    return true;
                }
            }
            return false;
        }
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}

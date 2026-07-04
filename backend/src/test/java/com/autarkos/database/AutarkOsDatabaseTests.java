package com.autarkos.database;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Locale;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

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

package com.projectos.database;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.activity.ActivityLogRepository;
import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

class ProjectOsDatabaseTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void migratesRuntimeDatabaseWithFlywayAndExposesConnections() throws Exception {
        RuntimeLayout runtimeLayout = runtimeLayout();
        ProjectOsDatabase database = new ProjectOsDatabase(runtimeLayout);

        database.migrate();

        assertThat(Files.exists(runtimeLayout.databasePath())).isTrue();
        try (Connection connection = database.connection(); Statement statement = connection.createStatement()) {
            assertThat(tableExists(statement, "flyway_schema_history")).isTrue();
            assertThat(tableExists(statement, "activity_logs")).isTrue();
            assertThat(tableExists(statement, "installed_apps")).isTrue();
            assertThat(tableExists(statement, "project_settings")).isTrue();
        }
    }

    @Test
    void repositoriesUseSharedDatabaseMigrationPath() {
        ProjectOsDatabase database = new ProjectOsDatabase(runtimeLayout());
        ActivityLogRepository repository = new ActivityLogRepository(database);

        repository.record("success", "system", "database_test", "Database migrated", "Migration-backed repository worked.", null, "completed", "");

        assertThat(repository.recent(5))
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.category()).isEqualTo("system");
                    assertThat(log.action()).isEqualTo("database_test");
                });
    }

    private boolean tableExists(Statement statement, String tableName) throws Exception {
        try (ResultSet resultSet = statement.executeQuery("select name from sqlite_master where type = 'table' and name = '" + tableName + "'")) {
            return resultSet.next();
        }
    }

    private RuntimeLayout runtimeLayout() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}

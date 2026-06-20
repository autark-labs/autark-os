package com.projectos.database;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

class DatabaseBackedRepositoryTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void exposesMigratedConnectionsToRepositorySubclasses() throws Exception {
        ProbeRepository repository = new ProbeRepository(new ProjectOsDatabase(runtimeLayout()));

        assertThat(repository.hasTable("project_settings")).isTrue();
    }

    private RuntimeLayout runtimeLayout() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private static class ProbeRepository extends DatabaseBackedRepository {

        private ProbeRepository(ProjectOsDatabase database) {
            super(database);
        }

        private boolean hasTable(String tableName) throws Exception {
            migrate();
            try (Connection connection = connection(); Statement statement = connection.createStatement()) {
                ResultSet resultSet = statement.executeQuery("select name from sqlite_master where type = 'table' and name = '" + tableName + "'");
                return resultSet.next();
            }
        }
    }
}

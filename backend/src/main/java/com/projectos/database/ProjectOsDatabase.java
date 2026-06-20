package com.projectos.database;

import java.io.IOException;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import org.flywaydb.core.Flyway;
import org.springframework.stereotype.Component;

import com.projectos.marketplace.install.InstallationException;
import com.projectos.marketplace.runtime.RuntimeLayout;

@Component
public class ProjectOsDatabase {

    private final RuntimeLayout runtimeLayout;
    private volatile boolean migrated;

    public ProjectOsDatabase(RuntimeLayout runtimeLayout) {
        this.runtimeLayout = runtimeLayout;
    }

    public Connection connection() throws SQLException {
        migrate();
        return DriverManager.getConnection(jdbcUrl());
    }

    public synchronized void migrate() {
        if (migrated) {
            return;
        }
        try {
            java.nio.file.Files.createDirectories(runtimeLayout.runtimeRoot());
            Flyway.configure()
                    .dataSource(jdbcUrl(), null, null)
                    .baselineOnMigrate(true)
                    .baselineVersion("0")
                    .load()
                    .migrate();
            ensureLegacyCompatibleColumns();
            migrated = true;
        } catch (IOException exception) {
            throw new InstallationException("Unable to create Project OS runtime root.", exception);
        } catch (RuntimeException exception) {
            throw new InstallationException("Unable to migrate Project OS database.", exception);
        }
    }

    private void ensureLegacyCompatibleColumns() {
        try (Connection connection = DriverManager.getConnection(jdbcUrl())) {
            ensureColumn(connection, "installed_app_settings", "private_access_url", "text");
            ensureColumn(connection, "installed_app_settings", "desired_access_mode", "text");
            ensureColumn(connection, "installed_app_settings", "private_access_requirement", "text");
            ensureColumn(connection, "installed_app_settings", "expected_local_port", "integer");
            ensureColumn(connection, "installed_app_settings", "expected_protocol", "text");
            ensureColumn(connection, "installed_app_settings", "last_access_check_at", "text");
            ensureColumn(connection, "installed_app_settings", "last_successful_access_at", "text");
            ensureColumn(connection, "installed_app_settings", "last_repair_attempt_at", "text");
            ensureColumn(connection, "installed_app_settings", "last_repair_status", "text");
            ensureColumn(connection, "installed_app_settings", "auto_repair_enabled", "integer not null default 1");
            ensureColumn(connection, "app_health", "message", "text");
            ensureColumn(connection, "app_health", "detail", "text");
            ensureColumn(connection, "app_health", "docker_status", "text");
            ensureColumn(connection, "app_health", "local_access_status", "text");
            ensureColumn(connection, "app_health", "private_access_status", "text");
            ensureColumn(connection, "app_health", "startup_grace", "integer not null default 0");
            ensureColumn(connection, "app_backups", "app_name", "text");
            ensureColumn(connection, "app_backups", "backup_scope", "text not null default 'app'");
            ensureColumn(connection, "app_backups", "backup_source", "text not null default 'manual'");
            ensureColumn(connection, "app_backups", "included_app_ids", "text");
            ensureColumn(connection, "app_backups", "size_bytes", "integer not null default 0");
            ensureColumn(connection, "app_backups", "message", "text");
            ensureColumn(connection, "app_backups", "verification_status", "text not null default 'not_checked'");
            ensureColumn(connection, "app_backups", "verification_message", "text");
            ensureColumn(connection, "app_backups", "checksum_sha256", "text");
            ensureColumn(connection, "app_backups", "restore_confidence", "text not null default 'unknown'");
            ensureColumn(connection, "app_backups", "verified_at", "text");
        } catch (SQLException exception) {
            throw new InstallationException("Unable to verify Project OS database schema.", exception);
        }
    }

    private void ensureColumn(Connection connection, String table, String column, String definition) throws SQLException {
        if (!tableExists(connection, table) || columnExists(connection, table, column)) {
            return;
        }
        try (Statement statement = connection.createStatement()) {
            statement.executeUpdate("alter table " + table + " add column " + column + " " + definition);
        }
    }

    private boolean tableExists(Connection connection, String table) throws SQLException {
        try (ResultSet resultSet = connection.getMetaData().getTables(null, null, table, null)) {
            return resultSet.next();
        }
    }

    private boolean columnExists(Connection connection, String table, String column) throws SQLException {
        try (Statement statement = connection.createStatement(); ResultSet columns = statement.executeQuery("pragma table_info(" + table + ")")) {
            while (columns.next()) {
                if (column.equals(columns.getString("name"))) {
                    return true;
                }
            }
        }
        return false;
    }

    private String jdbcUrl() {
        return "jdbc:sqlite:" + runtimeLayout.databasePath();
    }
}

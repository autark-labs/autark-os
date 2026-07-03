package com.autarkos.database;

import java.io.IOException;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

import org.flywaydb.core.Flyway;
import org.springframework.stereotype.Component;

import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.runtime.RuntimeLayout;

@Component
public class AutarkOsDatabase {

    private final RuntimeLayout runtimeLayout;
    private volatile boolean migrated;

    public AutarkOsDatabase(RuntimeLayout runtimeLayout) {
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
            migrated = true;
        } catch (IOException exception) {
            throw new InstallationException("Unable to create Autark-OS runtime root.", exception);
        } catch (RuntimeException exception) {
            throw new InstallationException("Unable to migrate Autark-OS database.", exception);
        }
    }

    private String jdbcUrl() {
        return "jdbc:sqlite:" + runtimeLayout.databasePath();
    }
}

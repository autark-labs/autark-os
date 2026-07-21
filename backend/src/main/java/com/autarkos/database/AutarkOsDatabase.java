package com.autarkos.database;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.attribute.PosixFilePermission;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Set;

import org.flywaydb.core.Flyway;
import org.springframework.stereotype.Component;

import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.runtime.RuntimeLayout;

@Component
public class AutarkOsDatabase {

    private static final Set<PosixFilePermission> PRIVATE_DATABASE_PERMISSIONS =
            Set.of(
                    PosixFilePermission.OWNER_READ,
                    PosixFilePermission.OWNER_WRITE);

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
            protectDatabaseFile();
            migrated = true;
        } catch (IOException exception) {
            throw new InstallationException(
                    "Unable to prepare Autark-OS database storage.",
                    exception);
        } catch (RuntimeException exception) {
            throw new InstallationException("Unable to migrate Autark-OS database.", exception);
        }
    }

    private String jdbcUrl() {
        return "jdbc:sqlite:" + runtimeLayout.databasePath();
    }

    private void protectDatabaseFile() throws IOException {
        if (Files.isSymbolicLink(runtimeLayout.databasePath())
                || !Files.isRegularFile(
                        runtimeLayout.databasePath(),
                        LinkOption.NOFOLLOW_LINKS)) {
            throw new IOException(
                    "Autark-OS database must be a regular local file.");
        }
        try {
            Files.setPosixFilePermissions(
                    runtimeLayout.databasePath(),
                    PRIVATE_DATABASE_PERMISSIONS);
        } catch (UnsupportedOperationException ignored) {
            // The production appliance is POSIX. Other development file systems
            // retain their platform ownership and ACL behavior.
        }
    }
}

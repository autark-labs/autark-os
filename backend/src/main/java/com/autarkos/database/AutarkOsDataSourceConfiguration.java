package com.autarkos.database;

import java.io.IOException;

import javax.sql.DataSource;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.sqlite.SQLiteDataSource;

import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.runtime.RuntimeLayout;

@Configuration
public class AutarkOsDataSourceConfiguration {

    static final int SQLITE_BUSY_TIMEOUT_MILLIS = 5_000;

    @Bean
    DataSource dataSource(RuntimeLayout runtimeLayout, AutarkOsDatabase database) {
        try {
            java.nio.file.Files.createDirectories(runtimeLayout.runtimeRoot());
            database.migrate();
        } catch (IOException exception) {
            throw new InstallationException("Unable to create Autark-OS runtime root.", exception);
        }
        SQLiteDataSource dataSource = new SQLiteDataSource();
        dataSource.setUrl("jdbc:sqlite:" + runtimeLayout.databasePath());
        // Reserve the writer before a transaction reads. With DEFERRED, two
        // JPA read-then-save transactions can deadlock when upgrading their
        // read locks; busy_timeout cannot make that upgrade safe. Keep these
        // transactions short and leave Docker/network work outside them.
        dataSource.setTransactionMode("IMMEDIATE");
        dataSource.setBusyTimeout(SQLITE_BUSY_TIMEOUT_MILLIS);
        return dataSource;
    }
}

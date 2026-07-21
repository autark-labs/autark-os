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
        /*
         * Pro lifecycle jobs intentionally interleave short JDBC state
         * transitions with REQUIRES_NEW JPA audit writes. SQLite has one
         * writer at a time, so give those bounded writes a chance to
         * serialize instead of failing an otherwise safe module operation
         * immediately with SQLITE_BUSY.
         */
        dataSource.setBusyTimeout(SQLITE_BUSY_TIMEOUT_MILLIS);
        return dataSource;
    }
}

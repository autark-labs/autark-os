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

    @Bean
    DataSource dataSource(RuntimeLayout runtimeLayout) {
        try {
            java.nio.file.Files.createDirectories(runtimeLayout.runtimeRoot());
        } catch (IOException exception) {
            throw new InstallationException("Unable to create Autark-OS runtime root.", exception);
        }
        SQLiteDataSource dataSource = new SQLiteDataSource();
        dataSource.setUrl("jdbc:sqlite:" + runtimeLayout.databasePath());
        return dataSource;
    }
}

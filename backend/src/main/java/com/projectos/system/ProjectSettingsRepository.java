package com.projectos.system;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import com.projectos.database.DatabaseBackedRepository;
import com.projectos.database.ProjectOsDatabase;
import com.projectos.marketplace.install.InstallationException;
import com.projectos.marketplace.runtime.RuntimeLayout;

@Repository
public class ProjectSettingsRepository extends DatabaseBackedRepository {

    private final RuntimeLayout runtimeLayout;

    @Autowired
    public ProjectSettingsRepository(ProjectOsDatabase database, RuntimeLayout runtimeLayout) {
        super(database);
        this.runtimeLayout = runtimeLayout;
    }

    public ProjectSettingsRepository(RuntimeLayout runtimeLayout) {
        this(new ProjectOsDatabase(runtimeLayout), runtimeLayout);
    }

    public Map<String, String> readAll() {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("select setting_key, setting_value from project_settings")) {
            ResultSet resultSet = statement.executeQuery();
            Map<String, String> settings = new HashMap<>();
            while (resultSet.next()) {
                settings.put(resultSet.getString("setting_key"), resultSet.getString("setting_value"));
            }
            return settings;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read Project OS settings.", exception);
        }
    }

    public Path backupDestination(Path fallback) {
        Map<String, String> values = readAll();
        String destination = values.get("backupDestination");
        if (destination == null || destination.isBlank()) {
            return fallback.toAbsolutePath().normalize();
        }
        return Path.of(destination).toAbsolutePath().normalize();
    }

    public boolean hasAnySettings() {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("select 1 from project_settings limit 1")) {
            ResultSet resultSet = statement.executeQuery();
            return resultSet.next();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read Project OS settings.", exception);
        }
    }

    public void save(ProjectSettings settings) {
        migrate();
        Map<String, String> values = Map.ofEntries(
                Map.entry("deviceName", settings.deviceName()),
                Map.entry("timeZone", settings.timeZone()),
                Map.entry("language", settings.language()),
                Map.entry("temperatureUnit", settings.temperatureUnit()),
                Map.entry("dateFormat", settings.dateFormat()),
                Map.entry("timeFormat", settings.timeFormat()),
                Map.entry("startOnBoot", Boolean.toString(settings.startOnBoot())),
                Map.entry("telemetryEnabled", Boolean.toString(settings.telemetryEnabled())),
                Map.entry("defaultInstallAccess", settings.defaultInstallAccess()),
                Map.entry("automaticRepairEnabled", Boolean.toString(settings.automaticRepairEnabled())),
                Map.entry("automaticBackupsEnabled", Boolean.toString(settings.automaticBackupsEnabled())),
                Map.entry("backupFrequency", settings.backupFrequency()),
                Map.entry("backupRetentionDays", Integer.toString(settings.backupRetentionDays())),
                Map.entry("backupTime", settings.backupTime()),
                Map.entry("updateChannel", settings.updateChannel()),
                Map.entry("showAdvancedMetrics", Boolean.toString(settings.showAdvancedMetrics())),
                Map.entry("updatedAt", settings.updatedAt().toString()));

        String sql = """
                insert into project_settings(setting_key, setting_value, updated_at)
                values(?, ?, ?)
                on conflict(setting_key) do update set setting_value = excluded.setting_value, updated_at = excluded.updated_at
                """;
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            for (Map.Entry<String, String> entry : values.entrySet()) {
                statement.setString(1, entry.getKey());
                statement.setString(2, entry.getValue());
                statement.setString(3, settings.updatedAt().toString());
                statement.addBatch();
            }
            statement.executeBatch();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to save Project OS settings.", exception);
        }
    }

    public void saveValues(Map<String, String> values) {
        migrate();
        String updatedAt = Instant.now().toString();
        String sql = """
                insert into project_settings(setting_key, setting_value, updated_at)
                values(?, ?, ?)
                on conflict(setting_key) do update set setting_value = excluded.setting_value, updated_at = excluded.updated_at
                """;
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            for (Map.Entry<String, String> entry : values.entrySet()) {
                statement.setString(1, entry.getKey());
                statement.setString(2, entry.getValue() == null ? "" : entry.getValue());
                statement.setString(3, updatedAt);
                statement.addBatch();
            }
            statement.executeBatch();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to save Project OS settings.", exception);
        }
    }

}

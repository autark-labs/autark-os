package com.projectos.marketplace.install;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import com.projectos.database.DatabaseBackedRepository;
import com.projectos.database.ProjectOsDatabase;
import com.projectos.marketplace.runtime.RuntimeLayout;

@Repository
public class InstalledAppRepository extends DatabaseBackedRepository {

    @Autowired
    public InstalledAppRepository(ProjectOsDatabase database) {
        super(database);
    }

    public InstalledAppRepository(RuntimeLayout runtimeLayout) {
        this(new ProjectOsDatabase(runtimeLayout));
    }

    public void save(InstalledApp app) {
        migrate();
        String sql = """
                insert into installed_apps(app_id, app_name, status, runtime_path, compose_project, access_url, installed_at)
                values(?, ?, ?, ?, ?, ?, ?)
                on conflict(app_id) do update set
                    app_name = excluded.app_name,
                    status = excluded.status,
                    runtime_path = excluded.runtime_path,
                    compose_project = excluded.compose_project,
                    access_url = excluded.access_url,
                    installed_at = excluded.installed_at
                """;
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            bindInstalledApp(statement, app);
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to save installed app state.", exception);
        }
    }

    public List<InstalledApp> findAll() {
        migrate();
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            ResultSet resultSet = statement.executeQuery("select * from installed_apps order by app_name");
            List<InstalledApp> apps = new ArrayList<>();
            while (resultSet.next()) {
                apps.add(installedApp(resultSet));
            }
            return apps;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read installed app state.", exception);
        }
    }

    public Optional<InstalledApp> findById(String appId) {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("select * from installed_apps where app_id = ?")) {
            statement.setString(1, appId);
            ResultSet resultSet = statement.executeQuery();
            if (resultSet.next()) {
                return Optional.of(installedApp(resultSet));
            }
            return Optional.empty();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read installed app state.", exception);
        }
    }

    public void updateStatus(String appId, String status) {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("update installed_apps set status = ? where app_id = ?")) {
            statement.setString(1, status);
            statement.setString(2, appId);
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to update installed app status.", exception);
        }
    }

    public void delete(String appId) {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("delete from installed_apps where app_id = ?")) {
            statement.setString(1, appId);
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to remove installed app state.", exception);
        }
    }

    public void saveSettings(String appId, InstallSettings settings) {
        migrate();
        String sql = """
                insert into installed_app_settings(
                    app_id,
                    access_url,
                    private_access_url,
                    tailscale_enabled,
                    storage_subfolders,
                    backup_enabled,
                    backup_frequency,
                    backup_retention,
                    desired_access_mode,
                    private_access_requirement,
                    expected_local_port,
                    expected_protocol,
                    last_access_check_at,
                    last_successful_access_at,
                    last_repair_attempt_at,
                    last_repair_status,
                    auto_repair_enabled
                )
                values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(app_id) do update set
                    access_url = excluded.access_url,
                    private_access_url = excluded.private_access_url,
                    tailscale_enabled = excluded.tailscale_enabled,
                    storage_subfolders = excluded.storage_subfolders,
                    backup_enabled = excluded.backup_enabled,
                    backup_frequency = excluded.backup_frequency,
                    backup_retention = excluded.backup_retention,
                    desired_access_mode = excluded.desired_access_mode,
                    private_access_requirement = excluded.private_access_requirement,
                    expected_local_port = excluded.expected_local_port,
                    expected_protocol = excluded.expected_protocol,
                    last_access_check_at = excluded.last_access_check_at,
                    last_successful_access_at = excluded.last_successful_access_at,
                    last_repair_attempt_at = excluded.last_repair_attempt_at,
                    last_repair_status = excluded.last_repair_status,
                    auto_repair_enabled = excluded.auto_repair_enabled
                """;
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, appId);
            statement.setString(2, settings.accessUrl());
            statement.setString(3, settings.privateAccessUrl());
            statement.setInt(4, settings.tailscaleEnabled() ? 1 : 0);
            statement.setString(5, encodeMap(settings.storageSubfolders()));
            statement.setInt(6, settings.backup().enabled() ? 1 : 0);
            statement.setString(7, settings.backup().frequency());
            statement.setInt(8, settings.backup().retention());
            statement.setString(9, settings.desiredAccessMode());
            statement.setString(10, settings.privateAccessRequirement());
            if (settings.expectedLocalPort() == null) {
                statement.setNull(11, java.sql.Types.INTEGER);
            } else {
                statement.setInt(11, settings.expectedLocalPort());
            }
            statement.setString(12, settings.expectedProtocol());
            statement.setString(13, encodeInstant(settings.lastAccessCheckAt()));
            statement.setString(14, encodeInstant(settings.lastSuccessfulAccessAt()));
            statement.setString(15, encodeInstant(settings.lastRepairAttemptAt()));
            statement.setString(16, settings.lastRepairStatus());
            statement.setInt(17, settings.autoRepairEnabled() ? 1 : 0);
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to save installed app settings.", exception);
        }
    }

    public Optional<InstallSettings> settingsFor(String appId) {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("select * from installed_app_settings where app_id = ?")) {
            statement.setString(1, appId);
            ResultSet resultSet = statement.executeQuery();
            if (!resultSet.next()) {
                return Optional.empty();
            }
            return Optional.of(new InstallSettings(
                    resultSet.getString("access_url"),
                    resultSet.getString("private_access_url"),
                    resultSet.getInt("tailscale_enabled") == 1,
                    decodeMap(resultSet.getString("storage_subfolders")),
                    new BackupPolicy(
                            resultSet.getInt("backup_enabled") == 1,
                            resultSet.getString("backup_frequency"),
                            resultSet.getInt("backup_retention")),
                    resultSet.getString("desired_access_mode"),
                    resultSet.getString("private_access_requirement"),
                    nullableInt(resultSet, "expected_local_port"),
                    resultSet.getString("expected_protocol"),
                    decodeInstant(resultSet.getString("last_access_check_at")),
                    decodeInstant(resultSet.getString("last_successful_access_at")),
                    decodeInstant(resultSet.getString("last_repair_attempt_at")),
                    resultSet.getString("last_repair_status"),
                    resultSet.getInt("auto_repair_enabled") == 1));
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read installed app settings.", exception);
        }
    }

    public void recordEvent(String appId, String type, String message) {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("insert into app_events(app_id, event_type, message, created_at) values(?, ?, ?, ?)")) {
            statement.setString(1, appId);
            statement.setString(2, type);
            statement.setString(3, message);
            statement.setString(4, Instant.now().toString());
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to record app event.", exception);
        }
    }

    public List<AppEvent> eventsFor(String appId, int limit) {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("select * from app_events where app_id = ? order by created_at desc, id desc limit ?")) {
            statement.setString(1, appId);
            statement.setInt(2, limit);
            ResultSet resultSet = statement.executeQuery();
            List<AppEvent> events = new ArrayList<>();
            while (resultSet.next()) {
                events.add(new AppEvent(
                        resultSet.getLong("id"),
                        resultSet.getString("app_id"),
                        resultSet.getString("event_type"),
                        resultSet.getString("message"),
                        Instant.parse(resultSet.getString("created_at"))));
            }
            return events;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read app events.", exception);
        }
    }

    public void saveHealthSnapshot(AppHealthSnapshot snapshot) {
        migrate();
        String sql = """
                insert into app_health(
                    app_id,
                    status,
                    message,
                    detail,
                    docker_status,
                    local_access_status,
                    private_access_status,
                    startup_grace,
                    checked_at
                )
                values(?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(app_id) do update set
                    status = excluded.status,
                    message = excluded.message,
                    detail = excluded.detail,
                    docker_status = excluded.docker_status,
                    local_access_status = excluded.local_access_status,
                    private_access_status = excluded.private_access_status,
                    startup_grace = excluded.startup_grace,
                    checked_at = excluded.checked_at
                """;
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, snapshot.appId());
            statement.setString(2, snapshot.status());
            statement.setString(3, snapshot.message());
            statement.setString(4, snapshot.detail());
            statement.setString(5, snapshot.dockerStatus());
            statement.setString(6, snapshot.localAccessStatus());
            statement.setString(7, snapshot.privateAccessStatus());
            statement.setInt(8, snapshot.startupGrace() ? 1 : 0);
            statement.setString(9, snapshot.checkedAt().toString());
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to save app health snapshot.", exception);
        }
    }

    public Optional<AppHealthSnapshot> healthFor(String appId) {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("select * from app_health where app_id = ?")) {
            statement.setString(1, appId);
            ResultSet resultSet = statement.executeQuery();
            if (!resultSet.next()) {
                return Optional.empty();
            }
            return Optional.of(healthSnapshot(resultSet));
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read app health snapshot.", exception);
        }
    }

    public Map<String, AppHealthSnapshot> healthSnapshots() {
        migrate();
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            ResultSet resultSet = statement.executeQuery("select * from app_health");
            Map<String, AppHealthSnapshot> snapshots = new LinkedHashMap<>();
            while (resultSet.next()) {
                AppHealthSnapshot snapshot = healthSnapshot(resultSet);
                snapshots.put(snapshot.appId(), snapshot);
            }
            return snapshots;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read app health snapshots.", exception);
        }
    }

    private void bindInstalledApp(PreparedStatement statement, InstalledApp app) throws SQLException {
        statement.setString(1, app.appId());
        statement.setString(2, app.appName());
        statement.setString(3, app.status());
        statement.setString(4, app.runtimePath());
        statement.setString(5, app.composeProject());
        statement.setString(6, app.accessUrl());
        statement.setString(7, app.installedAt().toString());
    }

    private InstalledApp installedApp(ResultSet resultSet) throws SQLException {
        return new InstalledApp(
                resultSet.getString("app_id"),
                resultSet.getString("app_name"),
                resultSet.getString("status"),
                resultSet.getString("runtime_path"),
                resultSet.getString("compose_project"),
                resultSet.getString("access_url"),
                Instant.parse(resultSet.getString("installed_at")));
    }

    private String encodeMap(Map<String, String> values) {
        if (values == null || values.isEmpty()) {
            return "";
        }
        return values.entrySet().stream()
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .reduce((left, right) -> left + ";" + right)
                .orElse("");
    }

    private Map<String, String> decodeMap(String value) {
        if (value == null || value.isBlank()) {
            return Map.of();
        }
        Map<String, String> values = new LinkedHashMap<>();
        for (String pair : value.split(";")) {
            String[] parts = pair.split("=", 2);
            if (parts.length == 2 && !parts[0].isBlank() && !parts[1].isBlank()) {
                values.put(parts[0], parts[1]);
            }
        }
        return values;
    }

    private String encodeInstant(Instant value) {
        return value == null ? null : value.toString();
    }

    private Instant decodeInstant(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return Instant.parse(value);
    }

    private Integer nullableInt(ResultSet resultSet, String column) throws SQLException {
        int value = resultSet.getInt(column);
        return resultSet.wasNull() ? null : value;
    }

    private AppHealthSnapshot healthSnapshot(ResultSet resultSet) throws SQLException {
        return new AppHealthSnapshot(
                resultSet.getString("app_id"),
                resultSet.getString("status"),
                valueOr(resultSet.getString("message"), resultSet.getString("status")),
                valueOr(resultSet.getString("detail"), ""),
                valueOr(resultSet.getString("docker_status"), resultSet.getString("status")),
                valueOr(resultSet.getString("local_access_status"), "not_checked"),
                valueOr(resultSet.getString("private_access_status"), "not_checked"),
                resultSet.getInt("startup_grace") == 1,
                Instant.parse(resultSet.getString("checked_at")));
    }

    private String valueOr(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}

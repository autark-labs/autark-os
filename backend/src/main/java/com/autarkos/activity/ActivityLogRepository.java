package com.autarkos.activity;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import com.autarkos.database.DatabaseBackedRepository;
import com.autarkos.database.AutarkOsDatabase;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.runtime.RuntimeLayout;

@Repository
public class ActivityLogRepository extends DatabaseBackedRepository {

    @Autowired
    public ActivityLogRepository(AutarkOsDatabase database) {
        super(database);
    }

    public ActivityLogRepository(RuntimeLayout runtimeLayout) {
        this(new AutarkOsDatabase(runtimeLayout));
    }

    public void record(String level, String category, String action, String title, String message, String appId, String outcome, String details) {
        migrate();
        String sql = """
                insert into activity_logs(level, category, action, title, message, app_id, outcome, details, created_at)
                values(?, ?, ?, ?, ?, ?, ?, ?, ?)
                """;
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, clean(level, "info"));
            statement.setString(2, clean(category, "system"));
            statement.setString(3, clean(action, "activity"));
            statement.setString(4, clean(title, "Autark-OS activity"));
            statement.setString(5, clean(message, ""));
            statement.setString(6, blankToNull(appId));
            statement.setString(7, clean(outcome, "recorded"));
            statement.setString(8, clean(details, ""));
            statement.setString(9, Instant.now().toString());
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to record Autark-OS activity.", exception);
        }
    }

    public List<ActivityLog> recent(int limit) {
        migrate();
        int safeLimit = Math.max(1, Math.min(limit, 200));
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("select * from activity_logs order by created_at desc, id desc limit ?")) {
            statement.setInt(1, safeLimit);
            ResultSet resultSet = statement.executeQuery();
            List<ActivityLog> logs = new ArrayList<>();
            while (resultSet.next()) {
                logs.add(activityLog(resultSet));
            }
            return logs;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read Autark-OS activity.", exception);
        }
    }

    public List<ActivityLog> recent(int limit, String level, String category, String outcome, String appId) {
        migrate();
        int safeLimit = Math.max(1, Math.min(limit, 200));
        List<String> clauses = new ArrayList<>();
        List<String> values = new ArrayList<>();
        addFilter(clauses, values, "level", level);
        addFilter(clauses, values, "category", category);
        addFilter(clauses, values, "outcome", outcome);
        addFilter(clauses, values, "app_id", appId);

        String sql = "select * from activity_logs"
                + (clauses.isEmpty() ? "" : " where " + String.join(" and ", clauses))
                + " order by created_at desc, id desc limit ?";

        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            for (int index = 0; index < values.size(); index++) {
                statement.setString(index + 1, values.get(index));
            }
            statement.setInt(values.size() + 1, safeLimit);
            ResultSet resultSet = statement.executeQuery();
            List<ActivityLog> logs = new ArrayList<>();
            while (resultSet.next()) {
                logs.add(activityLog(resultSet));
            }
            return logs;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read Autark-OS activity.", exception);
        }
    }

    private ActivityLog activityLog(ResultSet resultSet) throws SQLException {
        return new ActivityLog(
                resultSet.getLong("id"),
                resultSet.getString("level"),
                resultSet.getString("category"),
                resultSet.getString("action"),
                resultSet.getString("title"),
                resultSet.getString("message"),
                resultSet.getString("app_id"),
                resultSet.getString("outcome"),
                resultSet.getString("details"),
                Instant.parse(resultSet.getString("created_at")));
    }

    private String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private void addFilter(List<String> clauses, List<String> values, String column, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        clauses.add(column + " = ?");
        values.add(value.trim());
    }
}

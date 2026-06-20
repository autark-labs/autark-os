package com.projectos.backups;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import com.projectos.database.DatabaseBackedRepository;
import com.projectos.database.ProjectOsDatabase;
import com.projectos.marketplace.install.InstallationException;
import com.projectos.marketplace.runtime.RuntimeLayout;

@Repository
public class BackupRepository extends DatabaseBackedRepository {

    @Autowired
    public BackupRepository(ProjectOsDatabase database) {
        super(database);
    }

    public BackupRepository(RuntimeLayout runtimeLayout) {
        this(new ProjectOsDatabase(runtimeLayout));
    }

    public RestorePoint record(String appId, String appName, String path, String status, long sizeBytes, String message) {
        return record(appId, appName, "app", "manual", appId, path, status, sizeBytes, message);
    }

    public RestorePoint record(String appId, String appName, String scope, String source, String includedAppIds, String path, String status, long sizeBytes, String message) {
        migrate();
        String createdAt = Instant.now().toString();
        String sql = """
                insert into app_backups(app_id, app_name, backup_scope, backup_source, included_app_ids, backup_path, status, size_bytes, message, created_at)
                values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """;
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            statement.setString(1, appId);
            statement.setString(2, appName);
            statement.setString(3, clean(scope, "app"));
            statement.setString(4, clean(source, "manual"));
            statement.setString(5, clean(includedAppIds, appId));
            statement.setString(6, path);
            statement.setString(7, status);
            statement.setLong(8, sizeBytes);
            statement.setString(9, message);
            statement.setString(10, createdAt);
            statement.executeUpdate();
            ResultSet keys = statement.getGeneratedKeys();
            long id = keys.next() ? keys.getLong(1) : 0;
            return new RestorePoint(id, appId, appName, clean(scope, "app"), clean(source, "manual"), clean(includedAppIds, appId), status, path, sizeBytes, message, "not_checked", "Backup has not been verified yet.", "", "unknown", null, Instant.parse(createdAt));
        } catch (SQLException exception) {
            throw new InstallationException("Unable to record backup result.", exception);
        }
    }

    public RestorePoint updateVerification(long id, String verificationStatus, String verificationMessage, String checksumSha256, String restoreConfidence) {
        migrate();
        String verifiedAt = Instant.now().toString();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("""
                update app_backups
                set verification_status = ?,
                    verification_message = ?,
                    checksum_sha256 = ?,
                    restore_confidence = ?,
                    verified_at = ?
                where id = ?
                """)) {
            statement.setString(1, clean(verificationStatus, "not_checked"));
            statement.setString(2, clean(verificationMessage, "Backup verification has not run."));
            statement.setString(3, checksumSha256 == null ? "" : checksumSha256);
            statement.setString(4, clean(restoreConfidence, "unknown"));
            statement.setString(5, verifiedAt);
            statement.setLong(6, id);
            statement.executeUpdate();
            return findById(id);
        } catch (SQLException exception) {
            throw new InstallationException("Unable to update backup verification.", exception);
        }
    }

    public List<RestorePoint> recent(int limit) {
        migrate();
        int safeLimit = Math.max(1, Math.min(limit, 100));
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("select * from app_backups order by created_at desc, id desc limit ?")) {
            statement.setInt(1, safeLimit);
            ResultSet resultSet = statement.executeQuery();
            List<RestorePoint> backups = new ArrayList<>();
            while (resultSet.next()) {
                backups.add(restorePoint(resultSet));
            }
            return backups;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read backup history.", exception);
        }
    }

    public List<RestorePoint> forApp(String appId, int limit) {
        migrate();
        int safeLimit = Math.max(1, Math.min(limit, 50));
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("select * from app_backups where app_id = ? order by created_at desc, id desc limit ?")) {
            statement.setString(1, appId);
            statement.setInt(2, safeLimit);
            ResultSet resultSet = statement.executeQuery();
            List<RestorePoint> backups = new ArrayList<>();
            while (resultSet.next()) {
                backups.add(restorePoint(resultSet));
            }
            return backups;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read app backup history.", exception);
        }
    }

    public RestorePoint findById(long id) {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("select * from app_backups where id = ?")) {
            statement.setLong(1, id);
            ResultSet resultSet = statement.executeQuery();
            if (resultSet.next()) {
                return restorePoint(resultSet);
            }
            throw new InstallationException("Restore point was not found.");
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read restore point.", exception);
        }
    }

    private RestorePoint restorePoint(ResultSet resultSet) throws SQLException {
        return new RestorePoint(
                resultSet.getLong("id"),
                resultSet.getString("app_id"),
                resultSet.getString("app_name"),
                value(resultSet, "backup_scope", "app"),
                value(resultSet, "backup_source", "manual"),
                value(resultSet, "included_app_ids", resultSet.getString("app_id")),
                resultSet.getString("status"),
                resultSet.getString("backup_path"),
                resultSet.getLong("size_bytes"),
                resultSet.getString("message"),
                value(resultSet, "verification_status", "not_checked"),
                value(resultSet, "verification_message", "Backup has not been verified yet."),
                value(resultSet, "checksum_sha256", ""),
                value(resultSet, "restore_confidence", "unknown"),
                instantValue(resultSet, "verified_at"),
                Instant.parse(resultSet.getString("created_at")));
    }

    private String value(ResultSet resultSet, String column, String fallback) throws SQLException {
        String value = resultSet.getString(column);
        return value == null || value.isBlank() ? fallback : value;
    }

    private Instant instantValue(ResultSet resultSet, String column) throws SQLException {
        String value = resultSet.getString(column);
        return value == null || value.isBlank() ? null : Instant.parse(value);
    }

    private String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}

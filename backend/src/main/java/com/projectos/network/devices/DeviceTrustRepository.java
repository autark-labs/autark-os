package com.projectos.network.devices;

import com.projectos.network.api.DeviceTrustUpdateRequest;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
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
public class DeviceTrustRepository extends DatabaseBackedRepository {

    @Autowired
    public DeviceTrustRepository(ProjectOsDatabase database) {
        super(database);
    }

    public DeviceTrustRepository(RuntimeLayout runtimeLayout) {
        this(new ProjectOsDatabase(runtimeLayout));
    }

    public Map<String, DeviceTrustMetadata> findAll() {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("select * from device_trust_metadata")) {
            ResultSet resultSet = statement.executeQuery();
            Map<String, DeviceTrustMetadata> metadata = new HashMap<>();
            while (resultSet.next()) {
                DeviceTrustMetadata item = metadata(resultSet);
                metadata.put(item.deviceId(), item);
            }
            return metadata;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read device trust metadata.", exception);
        }
    }

    public DeviceTrustMetadata upsert(String deviceId, DeviceTrustUpdateRequest request) {
        migrate();
        Instant updatedAt = Instant.now();
        DeviceTrustMetadata metadata = new DeviceTrustMetadata(
                clean(deviceId, "unknown"),
                clean(request.nickname(), ""),
                clean(request.trustGroup(), "Personal devices"),
                request.trusted() == null || request.trusted(),
                clean(request.notes(), ""),
                updatedAt);
        String sql = """
                insert into device_trust_metadata(device_id, nickname, trust_group, trusted, notes, updated_at)
                values(?, ?, ?, ?, ?, ?)
                on conflict(device_id) do update set
                    nickname = excluded.nickname,
                    trust_group = excluded.trust_group,
                    trusted = excluded.trusted,
                    notes = excluded.notes,
                    updated_at = excluded.updated_at
                """;
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, metadata.deviceId());
            statement.setString(2, metadata.nickname());
            statement.setString(3, metadata.trustGroup());
            statement.setInt(4, metadata.trusted() ? 1 : 0);
            statement.setString(5, metadata.notes());
            statement.setString(6, metadata.updatedAt().toString());
            statement.executeUpdate();
            return metadata;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to save device trust metadata.", exception);
        }
    }

    private DeviceTrustMetadata metadata(ResultSet resultSet) throws SQLException {
        return new DeviceTrustMetadata(
                resultSet.getString("device_id"),
                resultSet.getString("nickname"),
                resultSet.getString("trust_group"),
                resultSet.getInt("trusted") == 1,
                resultSet.getString("notes"),
                Instant.parse(resultSet.getString("updated_at")));
    }

    private String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}

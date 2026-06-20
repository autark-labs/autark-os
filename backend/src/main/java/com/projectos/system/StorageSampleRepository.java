package com.projectos.system;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
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
public class StorageSampleRepository extends DatabaseBackedRepository {

    @Autowired
    public StorageSampleRepository(ProjectOsDatabase database) {
        super(database);
    }

    public StorageSampleRepository(RuntimeLayout runtimeLayout) {
        this(new ProjectOsDatabase(runtimeLayout));
    }

    public void record(String appId, long usedBytes, Instant sampledAt) {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("""
                insert into app_storage_samples(app_id, used_bytes, sampled_at)
                values(?, ?, ?)
                """)) {
            statement.setString(1, appId);
            statement.setLong(2, usedBytes);
            statement.setString(3, sampledAt.toString());
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to record storage sample.", exception);
        }
    }

    public List<StorageTrendPoint> forAppSince(String appId, Instant since) {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("""
                select used_bytes, sampled_at
                from app_storage_samples
                where app_id = ? and sampled_at >= ?
                order by sampled_at asc
                """)) {
            statement.setString(1, appId);
            statement.setString(2, since.toString());
            ResultSet resultSet = statement.executeQuery();
            List<StorageTrendPoint> samples = new ArrayList<>();
            while (resultSet.next()) {
                samples.add(new StorageTrendPoint(
                        resultSet.getLong("used_bytes"),
                        Instant.parse(resultSet.getString("sampled_at"))));
            }
            return samples;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read storage samples.", exception);
        }
    }

    public void deleteBefore(Instant cutoff) {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("delete from app_storage_samples where sampled_at < ?")) {
            statement.setString(1, cutoff.toString());
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to enforce storage sample retention.", exception);
        }
    }

}

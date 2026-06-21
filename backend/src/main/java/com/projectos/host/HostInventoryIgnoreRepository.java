package com.projectos.host;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import com.projectos.database.DatabaseBackedRepository;
import com.projectos.database.ProjectOsDatabase;
import com.projectos.marketplace.install.InstallationException;
import com.projectos.marketplace.runtime.RuntimeLayout;

@Repository
public class HostInventoryIgnoreRepository extends DatabaseBackedRepository {

    @Autowired
    public HostInventoryIgnoreRepository(ProjectOsDatabase database) {
        super(database);
    }

    public HostInventoryIgnoreRepository(RuntimeLayout runtimeLayout) {
        this(new ProjectOsDatabase(runtimeLayout));
    }

    public Set<String> ignoredResourceIds() {
        try (Connection connection = connection();
             PreparedStatement statement = connection.prepareStatement("select resource_id from host_inventory_ignores")) {
            Set<String> resourceIds = new HashSet<>();
            try (ResultSet resultSet = statement.executeQuery()) {
                while (resultSet.next()) {
                    resourceIds.add(resultSet.getString("resource_id"));
                }
            }
            return resourceIds;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read ignored host inventory resources.", exception);
        }
    }

    public void ignore(String resourceId) {
        try (Connection connection = connection();
             PreparedStatement statement = connection.prepareStatement("""
                     insert into host_inventory_ignores(resource_id, ignored_at)
                     values(?, ?)
                     on conflict(resource_id) do update set ignored_at = excluded.ignored_at
                     """)) {
            statement.setString(1, resourceId);
            statement.setString(2, Instant.now().toString());
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to ignore host inventory resource.", exception);
        }
    }

    public void unignore(String resourceId) {
        try (Connection connection = connection();
             PreparedStatement statement = connection.prepareStatement("delete from host_inventory_ignores where resource_id = ?")) {
            statement.setString(1, resourceId);
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to unignore host inventory resource.", exception);
        }
    }
}

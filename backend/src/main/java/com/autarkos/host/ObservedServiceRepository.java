package com.autarkos.host;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import com.autarkos.database.DatabaseBackedRepository;
import com.autarkos.database.AutarkOsDatabase;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.runtime.RuntimeLayout;

@Repository
public class ObservedServiceRepository extends DatabaseBackedRepository {

    @Autowired
    public ObservedServiceRepository(AutarkOsDatabase database) {
        super(database);
    }

    public ObservedServiceRepository(RuntimeLayout runtimeLayout) {
        this(new AutarkOsDatabase(runtimeLayout));
    }

    public List<ObservedService> findAll() {
        migrate();
        try (Connection connection = connection();
             PreparedStatement statement = connection.prepareStatement("select * from observed_services order by display_name")) {
            ResultSet resultSet = statement.executeQuery();
            List<ObservedService> services = new ArrayList<>();
            while (resultSet.next()) {
                services.add(observedService(resultSet));
            }
            return services;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read observed services.", exception);
        }
    }

    public Optional<ObservedService> findById(String id) {
        migrate();
        try (Connection connection = connection();
             PreparedStatement statement = connection.prepareStatement("select * from observed_services where id = ?")) {
            statement.setString(1, id);
            ResultSet resultSet = statement.executeQuery();
            if (resultSet.next()) {
                return Optional.of(observedService(resultSet));
            }
            return Optional.empty();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read observed service.", exception);
        }
    }

    public Optional<ObservedService> findBySourceAndFingerprint(String source, String fingerprint) {
        migrate();
        try (Connection connection = connection();
             PreparedStatement statement = connection.prepareStatement("select * from observed_services where source = ? and fingerprint = ?")) {
            statement.setString(1, source);
            statement.setString(2, fingerprint);
            ResultSet resultSet = statement.executeQuery();
            if (resultSet.next()) {
                return Optional.of(observedService(resultSet));
            }
            return Optional.empty();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read observed service.", exception);
        }
    }

    public void upsert(ObservedService service) {
        migrate();
        String sql = """
                insert into observed_services(
                    id, source, fingerprint, display_name, url, category, access_scope,
                    catalog_app_id, catalog_match_confidence, ownership_state, user_visibility,
                    runtime_state, health_check_enabled, autark_os_instance_id, first_seen_at,
                    last_seen_at, pinned_at, ignored_at, metadata_json
                )
                values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(source, fingerprint) do update set
                    display_name = excluded.display_name,
                    url = excluded.url,
                    category = excluded.category,
                    access_scope = excluded.access_scope,
                    catalog_app_id = excluded.catalog_app_id,
                    catalog_match_confidence = excluded.catalog_match_confidence,
                    ownership_state = excluded.ownership_state,
                    user_visibility = excluded.user_visibility,
                    runtime_state = excluded.runtime_state,
                    health_check_enabled = excluded.health_check_enabled,
                    autark_os_instance_id = excluded.autark_os_instance_id,
                    last_seen_at = excluded.last_seen_at,
                    pinned_at = excluded.pinned_at,
                    ignored_at = excluded.ignored_at,
                    metadata_json = excluded.metadata_json
                """;
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            bind(statement, service);
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to save observed service.", exception);
        }
    }

    public boolean pin(String id, Instant now) {
        migrate();
        return executeUpdate("""
                update observed_services
                set user_visibility = 'pinned', pinned_at = ?
                where id = ?
                """, now.toString(), id);
    }

    public boolean unpin(String id) {
        migrate();
        return executeUpdate("""
                update observed_services
                set user_visibility = 'observed', pinned_at = null
                where id = ?
                """, id);
    }

    public boolean updateCatalogMatch(String id, String catalogAppId, String confidence) {
        migrate();
        return executeUpdate("""
                update observed_services
                set catalog_app_id = ?, catalog_match_confidence = ?
                where id = ?
                """, cleanToNull(catalogAppId), confidence == null || confidence.isBlank() ? "unknown" : confidence, id);
    }

    public boolean markManaged(String id, String autarkOsInstanceId, Instant now) {
        migrate();
        return executeUpdate("""
                update observed_services
                set ownership_state = 'owned_managed',
                    autark_os_instance_id = ?,
                    user_visibility = 'observed',
                    ignored_at = null,
                    last_seen_at = ?
                where id = ?
                """, cleanToNull(autarkOsInstanceId), now.toString(), id);
    }

    public void deleteFailedInstall(String catalogAppId) {
        migrate();
        executeUpdate("""
                delete from observed_services
                where catalog_app_id = ?
                  and source = 'autark_os_install'
                  and ownership_state = 'failed_install'
                """, cleanToNull(catalogAppId));
    }

    public void deleteUnpinnedDockerServicesNotIn(Collection<String> fingerprints) {
        migrate();
        if (fingerprints == null || fingerprints.isEmpty()) {
            return;
        }
        String placeholders = fingerprints.stream().map(ignored -> "?").collect(java.util.stream.Collectors.joining(", "));
        String sql = """
                delete from observed_services
                where source = 'docker'
                  and coalesce(user_visibility, 'observed') != 'pinned'
                  and fingerprint not in (
                """ + placeholders + ")";
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            int index = 1;
            for (String fingerprint : fingerprints) {
                statement.setString(index++, fingerprint);
            }
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to remove stale observed services.", exception);
        }
    }

    private boolean executeUpdate(String sql, String... values) {
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            for (int index = 0; index < values.length; index++) {
                statement.setString(index + 1, values[index]);
            }
            return statement.executeUpdate() > 0;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to update observed service.", exception);
        }
    }

    private void bind(PreparedStatement statement, ObservedService service) throws SQLException {
        statement.setString(1, service.id());
        statement.setString(2, service.source());
        statement.setString(3, service.fingerprint());
        statement.setString(4, service.displayName());
        statement.setString(5, cleanToNull(service.url()));
        statement.setString(6, blankDefault(service.category(), "External"));
        statement.setString(7, blankDefault(service.accessScope(), "LAN"));
        statement.setString(8, cleanToNull(service.catalogAppId()));
        statement.setString(9, blankDefault(service.catalogMatchConfidence(), "unknown"));
        statement.setString(10, blankDefault(service.ownershipState(), "external"));
        statement.setString(11, blankDefault(service.userVisibility(), "observed"));
        statement.setString(12, blankDefault(service.runtimeState(), "unknown"));
        statement.setInt(13, service.healthCheckEnabled() ? 1 : 0);
        statement.setString(14, cleanToNull(service.autarkOsInstanceId()));
        statement.setString(15, service.firstSeenAt().toString());
        statement.setString(16, service.lastSeenAt().toString());
        statement.setString(17, service.pinnedAt() == null ? null : service.pinnedAt().toString());
        statement.setString(18, service.ignoredAt() == null ? null : service.ignoredAt().toString());
        statement.setString(19, blankDefault(service.metadataJson(), "{}"));
    }

    private ObservedService observedService(ResultSet resultSet) throws SQLException {
        return new ObservedService(
                resultSet.getString("id"),
                resultSet.getString("source"),
                resultSet.getString("fingerprint"),
                resultSet.getString("display_name"),
                resultSet.getString("url"),
                resultSet.getString("category"),
                resultSet.getString("access_scope"),
                resultSet.getString("catalog_app_id"),
                resultSet.getString("catalog_match_confidence"),
                resultSet.getString("ownership_state"),
                resultSet.getString("user_visibility"),
                resultSet.getString("runtime_state"),
                resultSet.getInt("health_check_enabled") == 1,
                resultSet.getString("autark_os_instance_id"),
                Instant.parse(resultSet.getString("first_seen_at")),
                Instant.parse(resultSet.getString("last_seen_at")),
                instant(resultSet.getString("pinned_at")),
                instant(resultSet.getString("ignored_at")),
                resultSet.getString("metadata_json"));
    }

    private Instant instant(String value) {
        return value == null || value.isBlank() ? null : Instant.parse(value);
    }

    private String cleanToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String blankDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}

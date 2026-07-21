package com.autarkos.extensions;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Optional;

import javax.sql.DataSource;

import org.springframework.stereotype.Repository;

@Repository
public class ExtensionStateStore {

    private static final int MAX_TOKEN_LENGTH = 262_144;

    private final DataSource dataSource;

    public ExtensionStateStore(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public synchronized Optional<String> load(
            String extensionId,
            String componentDigest,
            String scope) {
        String sql = """
                select opaque_state
                from extension_state
                where extension_id = ?
                  and component_digest = ?
                  and scope = ?
                """;
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement =
                        connection.prepareStatement(sql)) {
            statement.setString(1, extensionId);
            statement.setString(2, componentDigest);
            statement.setString(3, scope);
            try (ResultSet result = statement.executeQuery()) {
                return result.next()
                        ? Optional.of(result.getString("opaque_state"))
                        : Optional.empty();
            }
        } catch (SQLException exception) {
            throw new IllegalStateException(
                    "Extension state could not be loaded.", exception);
        }
    }

    public synchronized void save(
            String extensionId,
            String componentDigest,
            String scope,
            String opaqueState) {
        requireState(opaqueState);
        String sql = """
                insert into extension_state(
                    extension_id,
                    component_digest,
                    scope,
                    opaque_state,
                    updated_at
                ) values (?, ?, ?, ?, ?)
                on conflict(extension_id, component_digest, scope)
                do update set
                    opaque_state = excluded.opaque_state,
                    updated_at = excluded.updated_at
                """;
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement =
                        connection.prepareStatement(sql)) {
            statement.setString(1, extensionId);
            statement.setString(2, componentDigest);
            statement.setString(3, scope);
            statement.setString(4, opaqueState);
            statement.setString(5, Instant.now().toString());
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new IllegalStateException(
                    "Extension state could not be saved.", exception);
        }
    }

    public synchronized void clearOtherDigests(
            String extensionId,
            String componentDigest) {
        String sql = """
                delete from extension_state
                where extension_id = ?
                  and component_digest <> ?
                """;
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement =
                        connection.prepareStatement(sql)) {
            statement.setString(1, extensionId);
            statement.setString(2, componentDigest);
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new IllegalStateException(
                    "Stale extension state could not be cleared.", exception);
        }
    }

    private static void requireState(String opaqueState) {
        if (opaqueState == null
                || opaqueState.isBlank()
                || opaqueState.length() > MAX_TOKEN_LENGTH) {
            throw new IllegalArgumentException(
                    "Extension state is invalid.");
        }
    }
}

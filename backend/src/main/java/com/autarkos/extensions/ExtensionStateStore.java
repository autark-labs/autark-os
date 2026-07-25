package com.autarkos.extensions;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;

import javax.sql.DataSource;

import org.springframework.stereotype.Repository;

@Repository
public class ExtensionStateStore {

    private static final int MAX_TOKEN_LENGTH = 262_144;
    private static final String CANONICAL_SCOPE = "canonical";

    private final DataSource dataSource;

    public ExtensionStateStore(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public synchronized Optional<ExtensionState> loadCanonical(
            String extensionId,
            String componentDigest) {
        String sql = """
                select opaque_state, state_schema_version
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
            statement.setString(3, CANONICAL_SCOPE);
            try (ResultSet result = statement.executeQuery()) {
                return result.next()
                        ? Optional.of(new ExtensionState(
                                result.getString("opaque_state"),
                                result.getInt("state_schema_version")))
                        : Optional.empty();
            }
        } catch (SQLException exception) {
            throw new IllegalStateException(
                    "Extension state could not be loaded.", exception);
        }
    }

    public synchronized void saveCanonical(
            String extensionId,
            String componentDigest,
            int stateSchemaVersion,
            String opaqueState) {
        requireState(stateSchemaVersion, opaqueState);
        String sql = """
                insert into extension_state(
                    extension_id,
                    component_digest,
                    scope,
                    state_schema_version,
                    opaque_state,
                    updated_at
                ) values (?, ?, ?, ?, ?, ?)
                on conflict(extension_id, component_digest, scope)
                do update set
                    state_schema_version = excluded.state_schema_version,
                    opaque_state = excluded.opaque_state,
                    updated_at = excluded.updated_at
                """;
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement =
                        connection.prepareStatement(sql)) {
            statement.setString(1, extensionId);
            statement.setString(2, componentDigest);
            statement.setString(3, CANONICAL_SCOPE);
            statement.setInt(4, stateSchemaVersion);
            statement.setString(5, opaqueState);
            statement.setString(6, Instant.now().toString());
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new IllegalStateException(
                    "Extension state could not be saved.", exception);
        }
    }

    public synchronized boolean hasLegacySurfaceState(
            String extensionId,
            String componentDigest) {
        String sql = """
                select 1
                from extension_state
                where extension_id = ?
                  and component_digest = ?
                  and scope <> ?
                limit 1
                """;
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement =
                        connection.prepareStatement(sql)) {
            statement.setString(1, extensionId);
            statement.setString(2, componentDigest);
            statement.setString(3, CANONICAL_SCOPE);
            try (ResultSet result = statement.executeQuery()) {
                return result.next();
            }
        } catch (SQLException exception) {
            throw new IllegalStateException(
                    "Extension state could not be inspected.", exception);
        }
    }

    public synchronized void resetLegacySurfaceState(
            String extensionId,
            String componentDigest) {
        String sql = """
                delete from extension_state
                where extension_id = ?
                  and component_digest = ?
                  and scope <> ?
                """;
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement =
                        connection.prepareStatement(sql)) {
            statement.setString(1, extensionId);
            statement.setString(2, componentDigest);
            statement.setString(3, CANONICAL_SCOPE);
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new IllegalStateException(
                    "Legacy extension state could not be reset.", exception);
        }
    }

    public synchronized void clearCanonical(
            String extensionId,
            String componentDigest) {
        String sql = """
                delete from extension_state
                where extension_id = ?
                  and component_digest = ?
                  and scope = ?
                """;
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement =
                        connection.prepareStatement(sql)) {
            statement.setString(1, extensionId);
            statement.setString(2, componentDigest);
            statement.setString(3, CANONICAL_SCOPE);
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new IllegalStateException(
                    "Incompatible extension state could not be reset.", exception);
        }
    }

    public synchronized void cleanupExpired(
            String extensionId,
            Set<String> retainedDigests,
            Instant cutoff) {
        if (retainedDigests == null
                || retainedDigests.isEmpty()
                || retainedDigests.stream().anyMatch(value ->
                        value == null || value.isBlank())
                || cutoff == null) {
            throw new IllegalArgumentException(
                    "Extension state cleanup is invalid.");
        }
        String placeholders = String.join(
                ", ",
                java.util.Collections.nCopies(
                        retainedDigests.size(), "?"));
        String sql = """
                delete from extension_state
                where extension_id = ?
                  and component_digest not in (%s)
                  and updated_at < ?
                """.formatted(placeholders);
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement =
                        connection.prepareStatement(sql)) {
            statement.setString(1, extensionId);
            int index = 2;
            for (String digest : retainedDigests) {
                statement.setString(index++, digest);
            }
            statement.setString(index, cutoff.toString());
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new IllegalStateException(
                    "Expired extension state could not be cleared.", exception);
        }
    }

    private static void requireState(
            int stateSchemaVersion,
            String opaqueState) {
        if (stateSchemaVersion < 1
                || opaqueState == null
                || opaqueState.isBlank()
                || opaqueState.length() > MAX_TOKEN_LENGTH) {
            throw new IllegalArgumentException(
                    "Extension state is invalid.");
        }
    }

    public record ExtensionState(
            String opaqueState,
            int schemaVersion) {
    }
}

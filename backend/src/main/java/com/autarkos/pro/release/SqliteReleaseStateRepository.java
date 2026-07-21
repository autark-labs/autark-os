package com.autarkos.pro.release;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.OptionalLong;

import javax.sql.DataSource;

import org.springframework.stereotype.Repository;

import com.autarkos.pro.model.ProContractVerificationException;

@Repository
public class SqliteReleaseStateRepository implements ReleaseStateRepository {

    private final DataSource dataSource;

    public SqliteReleaseStateRepository(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public synchronized AcceptanceResult accept(AcceptedRelease release) {
        requireRelease(release);
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                CurrentState current = current(connection, release.component(), release.releaseChannel());
                if (current != null) {
                    if (release.sequence() < current.sequence()) {
                        connection.rollback();
                        return AcceptanceResult.LOWER_SEQUENCE;
                    }
                    if (release.sequence() == current.sequence()) {
                        connection.rollback();
                        return current.fingerprint().equals(release.manifestFingerprint())
                                && current.digest().equals(release.digest())
                                ? AcceptanceResult.IDEMPOTENT
                                : AcceptanceResult.SEQUENCE_CONFLICT;
                    }
                }
                insertHistory(connection, release);
                upsertState(connection, release);
                connection.commit();
                return AcceptanceResult.ACCEPTED;
            } catch (SQLException exception) {
                connection.rollback();
                throw exception;
            }
        } catch (SQLException exception) {
            throw failure("release_state_error");
        }
    }

    @Override
    public synchronized void markKnownGood(
            String component,
            String releaseChannel,
            String digest,
            String manifestFingerprint,
            Instant knownGoodAt) {
        if (knownGoodAt == null) {
            throw new IllegalArgumentException("Known-good time is required.");
        }
        String sql = """
                update pro_release_history
                set known_good_at = coalesce(known_good_at, ?)
                where component = ?
                  and release_channel = ?
                  and digest = ?
                  and manifest_fingerprint = ?
                """;
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, knownGoodAt.toString());
            statement.setString(2, component);
            statement.setString(3, releaseChannel);
            statement.setString(4, digest);
            statement.setString(5, manifestFingerprint);
            if (statement.executeUpdate() != 1) {
                throw failure("unknown_release");
            }
        } catch (ProContractVerificationException exception) {
            throw exception;
        } catch (SQLException exception) {
            throw failure("release_state_error");
        }
    }

    @Override
    public boolean isKnownGood(
            String component,
            String releaseChannel,
            String digest,
            String manifestFingerprint) {
        String sql = """
                select 1
                from pro_release_history
                where component = ?
                  and release_channel = ?
                  and digest = ?
                  and manifest_fingerprint = ?
                  and known_good_at is not null
                """;
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, component);
            statement.setString(2, releaseChannel);
            statement.setString(3, digest);
            statement.setString(4, manifestFingerprint);
            try (ResultSet result = statement.executeQuery()) {
                return result.next();
            }
        } catch (SQLException exception) {
            throw failure("release_state_error");
        }
    }

    @Override
    public OptionalLong highestAcceptedSequence(
            String component,
            String releaseChannel) {
        try (Connection connection = dataSource.getConnection()) {
            CurrentState current = current(connection, component, releaseChannel);
            return current == null
                    ? OptionalLong.empty()
                    : OptionalLong.of(current.sequence());
        } catch (SQLException exception) {
            throw failure("release_state_error");
        }
    }

    private static CurrentState current(
            Connection connection,
            String component,
            String releaseChannel) throws SQLException {
        String sql = """
                select highest_sequence, manifest_fingerprint, digest
                from pro_release_state
                where component = ? and release_channel = ?
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, component);
            statement.setString(2, releaseChannel);
            try (ResultSet result = statement.executeQuery()) {
                return result.next()
                        ? new CurrentState(
                                result.getLong("highest_sequence"),
                                result.getString("manifest_fingerprint"),
                                result.getString("digest"))
                        : null;
            }
        }
    }

    private static void insertHistory(
            Connection connection,
            AcceptedRelease release) throws SQLException {
        String sql = """
                insert into pro_release_history(
                    component,
                    release_channel,
                    manifest_sequence,
                    manifest_fingerprint,
                    digest,
                    version,
                    accepted_at
                ) values (?, ?, ?, ?, ?, ?, ?)
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, release.component());
            statement.setString(2, release.releaseChannel());
            statement.setLong(3, release.sequence());
            statement.setString(4, release.manifestFingerprint());
            statement.setString(5, release.digest());
            statement.setString(6, release.version());
            statement.setString(7, release.acceptedAt().toString());
            statement.executeUpdate();
        }
    }

    private static void upsertState(
            Connection connection,
            AcceptedRelease release) throws SQLException {
        String sql = """
                insert into pro_release_state(
                    component,
                    release_channel,
                    highest_sequence,
                    manifest_fingerprint,
                    digest,
                    accepted_at
                ) values (?, ?, ?, ?, ?, ?)
                on conflict(component, release_channel) do update set
                    highest_sequence = excluded.highest_sequence,
                    manifest_fingerprint = excluded.manifest_fingerprint,
                    digest = excluded.digest,
                    accepted_at = excluded.accepted_at
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, release.component());
            statement.setString(2, release.releaseChannel());
            statement.setLong(3, release.sequence());
            statement.setString(4, release.manifestFingerprint());
            statement.setString(5, release.digest());
            statement.setString(6, release.acceptedAt().toString());
            statement.executeUpdate();
        }
    }

    private static void requireRelease(AcceptedRelease release) {
        if (release == null
                || release.component() == null
                || release.releaseChannel() == null
                || release.sequence() < 1
                || release.manifestFingerprint() == null
                || release.digest() == null
                || release.version() == null
                || release.acceptedAt() == null) {
            throw new IllegalArgumentException("Accepted release is invalid.");
        }
    }

    private static ProContractVerificationException failure(String code) {
        return new ProContractVerificationException(
                code,
                "Autark Pro release state could not be updated.");
    }

    private record CurrentState(long sequence, String fingerprint, String digest) {
    }
}

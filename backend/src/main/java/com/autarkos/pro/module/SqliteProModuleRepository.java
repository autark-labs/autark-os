package com.autarkos.pro.module;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.regex.Pattern;

import javax.sql.DataSource;

import org.springframework.stereotype.Repository;

import com.autarkos.pro.model.ProModuleState;
import com.autarkos.pro.model.SignedEnvelopeV1;

@Repository
public class SqliteProModuleRepository implements ProModuleRepository {

    private static final Pattern DIGEST =
            Pattern.compile("^sha256:[0-9a-f]{64}$");
    private static final Pattern JOB_ID =
            Pattern.compile("^job_[0-9a-f]{32}$");
    private static final Pattern ERROR_CODE =
            Pattern.compile("^[a-z][a-z0-9_]{1,63}$");
    private static final String SELECT = """
            select *
            from pro_module_state
            where singleton_id = 1
            """;

    private final DataSource dataSource;

    public SqliteProModuleRepository(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public synchronized ProModuleSnapshot load() {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement =
                        connection.prepareStatement(SELECT);
                ResultSet result = statement.executeQuery()) {
            if (!result.next()) {
                throw new SQLException("missing singleton");
            }
            return read(result);
        } catch (SQLException | RuntimeException exception) {
            throw failure(exception);
        }
    }

    @Override
    public synchronized ProModuleSnapshot save(ProModuleSnapshot snapshot) {
        requireSnapshot(snapshot);
        String sql = """
                update pro_module_state
                set state = ?,
                    operation = ?,
                    job_id = ?,
                    component = ?,
                    component_version = ?,
                    agent_api_range = ?,
                    active_digest = ?,
                    active_manifest_fingerprint = ?,
                    previous_digest = ?,
                    previous_component_version = ?,
                    previous_agent_api_range = ?,
                    previous_manifest_fingerprint = ?,
                    candidate_digest = ?,
                    candidate_version = ?,
                    candidate_agent_api_range = ?,
                    candidate_manifest_sequence = ?,
                    candidate_manifest_fingerprint = ?,
                    candidate_envelope_payload = ?,
                    candidate_envelope_protected = ?,
                    candidate_envelope_signature = ?,
                    accepted_manifest_sequence = ?,
                    health = ?,
                    last_health_result = ?,
                    last_successful_transition_at = ?,
                    last_error_code = ?,
                    last_error_message = ?,
                    revision = revision + 1,
                    updated_at = ?
                where singleton_id = 1
                  and revision = ?
                """;
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement =
                        connection.prepareStatement(sql)) {
            bind(statement, snapshot);
            if (statement.executeUpdate() != 1) {
                throw new SQLException("module state changed concurrently");
            }
            return load();
        } catch (SQLException | RuntimeException exception) {
            if (exception instanceof ProModulePersistenceException persistence) {
                throw persistence;
            }
            throw failure(exception);
        }
    }

    @Override
    public synchronized ProModuleSnapshot replaceCorruptState(
            String errorCode,
            String message) {
        String safeCode = validErrorCode(errorCode)
                ? errorCode
                : "module_state_corrupt";
        String safeMessage = safeErrorMessage(message)
                ? message
                : "Pro module state needs recovery.";
        Instant now = Instant.now();
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try (PreparedStatement delete = connection.prepareStatement(
                            "delete from pro_module_state where singleton_id = 1");
                    PreparedStatement insert = connection.prepareStatement("""
                            insert into pro_module_state(
                                singleton_id,
                                state,
                                health,
                                last_successful_transition_at,
                                last_error_code,
                                last_error_message,
                                revision,
                                updated_at
                            ) values (1, 'ERROR', 'failed', ?, ?, ?, 0, ?)
                            """)) {
                delete.executeUpdate();
                insert.setString(1, now.toString());
                insert.setString(2, safeCode);
                insert.setString(3, safeMessage);
                insert.setString(4, now.toString());
                insert.executeUpdate();
                connection.commit();
            } catch (SQLException exception) {
                connection.rollback();
                throw exception;
            }
            return load();
        } catch (SQLException | RuntimeException exception) {
            if (exception instanceof ProModulePersistenceException persistence) {
                throw persistence;
            }
            throw failure(exception);
        }
    }

    private static ProModuleSnapshot read(ResultSet result)
            throws SQLException {
        String payload = result.getString("candidate_envelope_payload");
        String protectedHeader =
                result.getString("candidate_envelope_protected");
        String signature =
                result.getString("candidate_envelope_signature");
        SignedEnvelopeV1 envelope = payload == null
                ? null
                : new SignedEnvelopeV1(payload, protectedHeader, signature);
        ProModuleSnapshot snapshot = new ProModuleSnapshot(
                ProModuleState.valueOf(result.getString("state")),
                result.getString("operation"),
                result.getString("job_id"),
                result.getString("component"),
                result.getString("component_version"),
                result.getString("agent_api_range"),
                result.getString("active_digest"),
                result.getString("active_manifest_fingerprint"),
                result.getString("previous_digest"),
                result.getString("previous_component_version"),
                result.getString("previous_agent_api_range"),
                result.getString("previous_manifest_fingerprint"),
                result.getString("candidate_digest"),
                result.getString("candidate_version"),
                result.getString("candidate_agent_api_range"),
                nullableLong(result, "candidate_manifest_sequence"),
                result.getString("candidate_manifest_fingerprint"),
                envelope,
                nullableLong(result, "accepted_manifest_sequence"),
                result.getString("health"),
                result.getString("last_health_result"),
                nullableInstant(result, "last_successful_transition_at"),
                result.getString("last_error_code"),
                result.getString("last_error_message"),
                result.getLong("revision"),
                Instant.parse(result.getString("updated_at")));
        requireSnapshot(snapshot);
        return snapshot;
    }

    private static void bind(
            PreparedStatement statement,
            ProModuleSnapshot snapshot) throws SQLException {
        statement.setString(1, snapshot.state().name());
        statement.setString(2, snapshot.operation());
        statement.setString(3, snapshot.jobId());
        statement.setString(4, snapshot.component());
        statement.setString(5, snapshot.componentVersion());
        statement.setString(6, snapshot.agentApiRange());
        statement.setString(7, snapshot.activeDigest());
        statement.setString(8, snapshot.activeManifestFingerprint());
        statement.setString(9, snapshot.previousDigest());
        statement.setString(10, snapshot.previousComponentVersion());
        statement.setString(11, snapshot.previousAgentApiRange());
        statement.setString(12, snapshot.previousManifestFingerprint());
        statement.setString(13, snapshot.candidateDigest());
        statement.setString(14, snapshot.candidateVersion());
        statement.setString(15, snapshot.candidateAgentApiRange());
        nullableLong(statement, 16, snapshot.candidateManifestSequence());
        statement.setString(17, snapshot.candidateManifestFingerprint());
        statement.setString(
                18,
                snapshot.candidateEnvelope() == null
                        ? null
                        : snapshot.candidateEnvelope().payload());
        statement.setString(
                19,
                snapshot.candidateEnvelope() == null
                        ? null
                        : snapshot.candidateEnvelope().protectedHeader());
        statement.setString(
                20,
                snapshot.candidateEnvelope() == null
                        ? null
                        : snapshot.candidateEnvelope().signature());
        nullableLong(statement, 21, snapshot.acceptedManifestSequence());
        statement.setString(22, snapshot.health());
        statement.setString(23, snapshot.lastHealthResult());
        statement.setString(
                24,
                snapshot.lastSuccessfulTransitionAt() == null
                        ? null
                        : snapshot.lastSuccessfulTransitionAt().toString());
        statement.setString(25, snapshot.lastErrorCode());
        statement.setString(26, snapshot.lastErrorMessage());
        statement.setString(27, snapshot.updatedAt().toString());
        statement.setLong(28, snapshot.revision());
    }

    private static void requireSnapshot(ProModuleSnapshot snapshot) {
        if (snapshot == null
                || snapshot.state() == null
                || snapshot.health() == null
                || !java.util.List.of(
                                "not-checked",
                                "healthy",
                                "degraded",
                                "failed")
                        .contains(snapshot.health())
                || snapshot.revision() < 0
                || snapshot.updatedAt() == null
                || !validDigest(snapshot.activeDigest())
                || !validDigest(snapshot.previousDigest())
                || !validDigest(snapshot.previousManifestFingerprint())
                || !validDigest(snapshot.candidateDigest())
                || !validDigest(snapshot.activeManifestFingerprint())
                || !validDigest(snapshot.candidateManifestFingerprint())
                || (snapshot.jobId() != null
                        && !JOB_ID.matcher(snapshot.jobId()).matches())
                || (snapshot.lastErrorCode() != null
                        && !validErrorCode(snapshot.lastErrorCode()))
                || !safeErrorMessage(snapshot.lastErrorMessage())
                || !candidateFieldsConsistent(snapshot)
                || !previousFieldsConsistent(snapshot)
                || !activeFieldsConsistent(snapshot)
                || !stateFieldsConsistent(snapshot)) {
            throw new IllegalArgumentException(
                    "Persisted Pro module state is invalid.");
        }
    }

    private static boolean candidateFieldsConsistent(
            ProModuleSnapshot snapshot) {
        boolean absent = snapshot.candidateDigest() == null
                && snapshot.candidateVersion() == null
                && snapshot.candidateAgentApiRange() == null
                && snapshot.candidateManifestSequence() == null
                && snapshot.candidateManifestFingerprint() == null
                && snapshot.candidateEnvelope() == null;
        boolean present = snapshot.candidateDigest() != null
                && snapshot.candidateVersion() != null
                && snapshot.candidateAgentApiRange() != null
                && snapshot.candidateManifestSequence() != null
                && snapshot.candidateManifestSequence() > 0
                && snapshot.candidateManifestFingerprint() != null
                && snapshot.candidateEnvelope() != null
                && snapshot.candidateEnvelope().payload() != null
                && snapshot.candidateEnvelope().protectedHeader() != null
                && snapshot.candidateEnvelope().signature() != null;
        return absent || present;
    }

    private static boolean activeFieldsConsistent(
            ProModuleSnapshot snapshot) {
        boolean absent = snapshot.activeDigest() == null
                && snapshot.activeManifestFingerprint() == null
                && snapshot.component() == null
                && snapshot.componentVersion() == null
                && snapshot.agentApiRange() == null
                && snapshot.previousDigest() == null
                && snapshot.previousComponentVersion() == null
                && snapshot.previousAgentApiRange() == null
                && snapshot.previousManifestFingerprint() == null;
        boolean present = snapshot.activeDigest() != null
                && snapshot.activeManifestFingerprint() != null
                && snapshot.component() != null
                && snapshot.componentVersion() != null
                && snapshot.agentApiRange() != null;
        return absent || present;
    }

    private static boolean previousFieldsConsistent(
            ProModuleSnapshot snapshot) {
        boolean absent = snapshot.previousDigest() == null
                && snapshot.previousComponentVersion() == null
                && snapshot.previousAgentApiRange() == null
                && snapshot.previousManifestFingerprint() == null;
        boolean present = snapshot.previousDigest() != null
                && snapshot.previousComponentVersion() != null
                && snapshot.previousAgentApiRange() != null
                && snapshot.previousManifestFingerprint() != null;
        return absent || present;
    }

    private static boolean stateFieldsConsistent(
            ProModuleSnapshot snapshot) {
        boolean active = snapshot.activeDigest() != null;
        boolean candidate = snapshot.candidateDigest() != null;
        return switch (snapshot.state()) {
            case NOT_INSTALLED -> !active && !candidate;
            case RELEASE_AVAILABLE,
                    DOWNLOADING,
                    VERIFYING,
                    STARTING_CANDIDATE,
                    HEALTH_CHECKING -> candidate;
            case ROLLING_BACK ->
                    candidate || active && snapshot.previousDigest() != null;
            case ACTIVE, DEGRADED, RETAINED_USE ->
                    active && !candidate;
            case UPDATE_INELIGIBLE -> !candidate;
            case REMOVING, ERROR -> true;
        };
    }

    private static boolean validDigest(String value) {
        return value == null || DIGEST.matcher(value).matches();
    }

    private static boolean validErrorCode(String value) {
        return value != null && ERROR_CODE.matcher(value).matches();
    }

    private static boolean safeErrorMessage(String value) {
        if (value == null) {
            return true;
        }
        String lower = value.toLowerCase(java.util.Locale.ROOT);
        return !value.isBlank()
                && value.length() <= 256
                && java.util.stream.Stream.of(
                                "authorization",
                                "bearer",
                                "credential",
                                "private key",
                                "secret",
                                "token")
                        .noneMatch(lower::contains);
    }

    private static Long nullableLong(ResultSet result, String column)
            throws SQLException {
        long value = result.getLong(column);
        return result.wasNull() ? null : value;
    }

    private static Instant nullableInstant(ResultSet result, String column)
            throws SQLException {
        String value = result.getString(column);
        return value == null ? null : Instant.parse(value);
    }

    private static void nullableLong(
            PreparedStatement statement,
            int index,
            Long value) throws SQLException {
        if (value == null) {
            statement.setNull(index, java.sql.Types.BIGINT);
        } else {
            statement.setLong(index, value);
        }
    }

    private static ProModulePersistenceException failure(
            Throwable cause) {
        return new ProModulePersistenceException(
                "Autark Pro module state is unavailable.",
                cause);
    }
}

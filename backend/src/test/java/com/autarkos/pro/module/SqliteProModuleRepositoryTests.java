package com.autarkos.pro.module;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;
import java.sql.Connection;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.sqlite.SQLiteDataSource;

import com.autarkos.pro.model.ProReleaseManifest;
import com.autarkos.pro.model.SignedEnvelopeV1;

class SqliteProModuleRepositoryTests {

    @TempDir
    Path directory;

    @Test
    void moduleAuthorityAndRollbackReferencesSurviveRestart()
            throws Exception {
        SQLiteDataSource dataSource = dataSource();
        SqliteProModuleRepository first =
                new SqliteProModuleRepository(dataSource);
        ProModuleSnapshot initial = first.load();
        ProModuleCandidate candidate = candidate();

        ProModuleSnapshot available = first.save(
                initial.withCandidate(
                        candidate,
                        "install",
                        "job_" + "a".repeat(32),
                        Instant.parse("2026-07-19T12:00:00Z")));

        SqliteProModuleRepository restarted =
                new SqliteProModuleRepository(dataSource);
        ProModuleSnapshot restored = restarted.load();
        assertThat(restored.state())
                .isEqualTo(
                        com.autarkos.pro.model.ProModuleState.RELEASE_AVAILABLE);
        assertThat(restored.candidateDigest())
                .isEqualTo(candidate.manifest().digest());
        assertThat(restored.candidateEnvelope())
                .isEqualTo(candidate.envelope());
        assertThat(restored.acceptedManifestSequence()).isEqualTo(7);
        assertThat(restored.revision()).isEqualTo(available.revision());

        try (Connection connection = dataSource.getConnection();
                var statement =
                        connection.prepareStatement(
                                "pragma table_info(pro_module_state)");
                var columns = statement.executeQuery()) {
            HashSet<String> names = new HashSet<>();
            while (columns.next()) {
                names.add(columns.getString("name"));
            }
            assertThat(names)
                    .noneMatch(name -> name.contains("registry"))
                    .noneMatch(name -> name.contains("private"))
                    .noneMatch(name -> name.contains("secret"));
        }
    }

    @Test
    void corruptStateIsRejectedAndCanBeReplacedWithSafeError()
            throws Exception {
        SQLiteDataSource dataSource = dataSource();
        try (Connection connection = dataSource.getConnection();
                var dropTrigger = connection.prepareStatement(
                        "drop trigger pro_module_state_semantic_update");
                var pragma = connection.prepareStatement(
                        "pragma ignore_check_constraints = on");
                var update = connection.prepareStatement("""
                        update pro_module_state
                        set state = 'BROKEN',
                            last_error_message = 'Bearer must never persist'
                        where singleton_id = 1
                        """)) {
            dropTrigger.execute();
            pragma.execute();
            update.executeUpdate();
        }
        SqliteProModuleRepository repository =
                new SqliteProModuleRepository(dataSource);

        assertThatThrownBy(repository::load)
                .isInstanceOf(ProModulePersistenceException.class);
        ProModuleSnapshot recovered = repository.replaceCorruptState(
                "module_state_corrupt",
                "Pro module state needs recovery.");

        assertThat(recovered.state())
                .isEqualTo(com.autarkos.pro.model.ProModuleState.ERROR);
        assertThat(recovered.lastErrorCode())
                .isEqualTo("module_state_corrupt");
        assertThat(recovered.lastErrorMessage())
                .doesNotContainIgnoringCase("bearer");
    }

    @Test
    void persistenceRejectsSecretShapedErrorText() {
        SqliteProModuleRepository repository =
                new SqliteProModuleRepository(dataSource());
        ProModuleSnapshot invalid = repository.load().withState(
                com.autarkos.pro.model.ProModuleState.ERROR,
                null,
                null,
                "failed",
                null,
                "module_failed",
                "Bearer secret leaked",
                Instant.parse("2026-07-19T12:00:00Z"));

        assertThatThrownBy(() -> repository.save(invalid))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageNotContaining("Bearer secret leaked");
    }

    @Test
    void semanticallyCorruptActiveStateFailsClosed() throws Exception {
        SQLiteDataSource dataSource = dataSource();
        try (Connection connection = dataSource.getConnection();
                var dropTrigger = connection.prepareStatement(
                        "drop trigger pro_module_state_semantic_update");
                var pragma = connection.prepareStatement(
                        "pragma ignore_check_constraints = on");
                var update = connection.prepareStatement("""
                        update pro_module_state
                        set state = 'ACTIVE'
                        where singleton_id = 1
                        """)) {
            dropTrigger.execute();
            pragma.execute();
            update.executeUpdate();
        }

        assertThatThrownBy(
                        new SqliteProModuleRepository(dataSource)::load)
                .isInstanceOf(ProModulePersistenceException.class)
                .hasMessageNotContaining("ACTIVE");
    }

    @Test
    void rollbackGenerationMetadataRestoresExactlyAfterRestart() {
        SqliteProModuleRepository repository =
                new SqliteProModuleRepository(dataSource());
        Instant now = Instant.parse("2026-07-19T12:00:00Z");
        ProModuleCandidate first = candidate();
        ProModuleCandidate second = candidate(
                8,
                "1.3.0",
                "e",
                "b");

        ProModuleSnapshot firstActive = repository.save(
                repository.load()
                        .withCandidate(
                                first,
                                "install",
                                "job_" + "a".repeat(32),
                                now)
                        .activateCandidate(
                                "job_" + "a".repeat(32),
                                "healthy",
                                now));
        ProModuleSnapshot secondActive = repository.save(
                firstActive
                        .withCandidate(
                                second,
                                "update",
                                "job_" + "b".repeat(32),
                                now.plusSeconds(1))
                        .activateCandidate(
                                "job_" + "b".repeat(32),
                                "healthy",
                                now.plusSeconds(2)));

        ProModuleSnapshot restarted =
                new SqliteProModuleRepository(dataSource())
                        .load();
        assertThat(restarted.previousDigest())
                .isEqualTo(first.manifest().digest());
        assertThat(restarted.previousComponentVersion())
                .isEqualTo(first.manifest().version());
        assertThat(restarted.previousAgentApiRange())
                .isEqualTo(first.manifest().agentApiRange());
        assertThat(restarted.previousManifestFingerprint())
                .isEqualTo(first.fingerprint());

        ProModuleSnapshot rolledBack = repository.save(
                secondActive.restorePrevious(
                        null,
                        "crash_loop_rollback",
                        now.plusSeconds(3)));
        assertThat(rolledBack.activeDigest())
                .isEqualTo(first.manifest().digest());
        assertThat(rolledBack.componentVersion())
                .isEqualTo(first.manifest().version());
        assertThat(rolledBack.previousDigest()).isNull();
    }

    @Test
    void v24DiscardsIncompleteLegacyRollbackAuthority()
            throws Exception {
        String url = "jdbc:sqlite:"
                + directory.resolve("upgrade.db");
        Flyway.configure()
                .dataSource(url, null, null)
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .target(MigrationVersion.fromVersion("23"))
                .load()
                .migrate();
        SQLiteDataSource dataSource = new SQLiteDataSource();
        dataSource.setUrl(url);
        try (Connection connection = dataSource.getConnection();
                var update = connection.prepareStatement("""
                        update pro_module_state
                        set state = 'ACTIVE',
                            component = 'autark-pro-agent',
                            component_version = '1.2.3',
                            agent_api_range = '1.x',
                            active_digest = ?,
                            active_manifest_fingerprint = ?,
                            previous_digest = ?,
                            health = 'healthy'
                        where singleton_id = 1
                        """)) {
            update.setString(
                    1,
                    "sha256:" + "a".repeat(64));
            update.setString(
                    2,
                    "sha256:" + "b".repeat(64));
            update.setString(
                    3,
                    "sha256:" + "c".repeat(64));
            update.executeUpdate();
        }

        Flyway.configure()
                .dataSource(url, null, null)
                .load()
                .migrate();
        ProModuleSnapshot migrated =
                new SqliteProModuleRepository(dataSource).load();

        assertThat(migrated.activeDigest())
                .isEqualTo("sha256:" + "a".repeat(64));
        assertThat(migrated.previousDigest()).isNull();
        assertThat(migrated.state())
                .isEqualTo(
                        com.autarkos.pro.model.ProModuleState.ACTIVE);
    }

    private SQLiteDataSource dataSource() {
        String url = "jdbc:sqlite:"
                + directory.resolve("autark-os.db");
        Flyway.configure()
                .dataSource(url, null, null)
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .load()
                .migrate();
        SQLiteDataSource dataSource = new SQLiteDataSource();
        dataSource.setUrl(url);
        return dataSource;
    }

    static ProModuleCandidate candidate() {
        return candidate(7, "1.2.3", "d", "c");
    }

    private static ProModuleCandidate candidate(
            long sequence,
            String version,
            String digestCharacter,
            String fingerprintCharacter) {
        return new ProModuleCandidate(
                new ProReleaseManifest(
                        "1",
                        sequence,
                        Instant.parse("2026-07-19T12:00:00Z"),
                        Instant.parse("2026-07-19T12:10:00Z"),
                        "staging",
                        "autark-pro-agent",
                        version,
                        "registry.staging.autarklabs.com/autark-pro-agent",
                        "sha256:" + digestCharacter.repeat(64),
                        "linux/amd64",
                        Instant.parse("2026-07-19T11:59:00Z"),
                        "1.0.0",
                        null,
                        "1.x",
                        "prototype",
                        List.of("autark-pro.extension"),
                        "release-test-key"),
                "sha256:" + fingerprintCharacter.repeat(64),
                new SignedEnvelopeV1("eA", "eA", "eA"));
    }
}

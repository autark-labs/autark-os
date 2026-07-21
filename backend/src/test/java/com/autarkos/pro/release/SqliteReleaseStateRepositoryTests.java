package com.autarkos.pro.release;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.sqlite.SQLiteDataSource;

import com.autarkos.pro.release.ReleaseStateRepository.AcceptanceResult;
import com.autarkos.pro.release.ReleaseStateRepository.AcceptedRelease;

class SqliteReleaseStateRepositoryTests {

    @TempDir
    Path directory;

    @Test
    void highWaterMarkAndKnownGoodAuthoritySurviveRestart() {
        String url = "jdbc:sqlite:" + directory.resolve("autark-os.db");
        Flyway.configure()
                .dataSource(url, null, null)
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .load()
                .migrate();
        SQLiteDataSource dataSource = new SQLiteDataSource();
        dataSource.setUrl(url);
        SqliteReleaseStateRepository first =
                new SqliteReleaseStateRepository(dataSource);
        AcceptedRelease release = release(7, "c", "d");

        assertThat(first.accept(release)).isEqualTo(AcceptanceResult.ACCEPTED);
        first.markKnownGood(
                release.component(),
                release.releaseChannel(),
                release.digest(),
                release.manifestFingerprint(),
                Instant.parse("2026-07-19T12:01:00Z"));

        SqliteReleaseStateRepository restarted =
                new SqliteReleaseStateRepository(dataSource);
        assertThat(restarted.highestAcceptedSequence(
                release.component(),
                release.releaseChannel())).hasValue(7);
        assertThat(restarted.isKnownGood(
                release.component(),
                release.releaseChannel(),
                release.digest(),
                release.manifestFingerprint())).isTrue();
        assertThat(restarted.accept(release(6, "a", "b")))
                .isEqualTo(AcceptanceResult.LOWER_SEQUENCE);
        assertThat(restarted.accept(release(7, "e", "f")))
                .isEqualTo(AcceptanceResult.SEQUENCE_CONFLICT);
    }

    private static AcceptedRelease release(
            long sequence,
            String fingerprintCharacter,
            String digestCharacter) {
        return new AcceptedRelease(
                "autark-pro-agent",
                "staging",
                sequence,
                "sha256:" + fingerprintCharacter.repeat(64),
                "sha256:" + digestCharacter.repeat(64),
                "0.1." + sequence,
                Instant.parse("2026-07-19T12:00:00Z"));
    }
}

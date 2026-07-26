package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.fasterxml.jackson.databind.ObjectMapper;

class CoreUpdateReleaseClientTests {

    @TempDir
    Path tempDir;

    @Test
    void selectsAndVerifiesThePublishedArchitectureMatchedBetaRelease()
            throws Exception {
        String architecture = architecture();
        byte[] archive = "release".getBytes(StandardCharsets.UTF_8);
        String version = "0.9.1-beta.17";
        String tag = "v" + version;
        String filename = "autark-os-" + version + "-" + architecture + ".tar.gz";
        String artifactUrl = "https://github.com/autark-labs/autark-os/releases/download/"
                + tag + "/" + filename;
        String releases = """
                [{"tag_name":"%s","draft":false,"prerelease":true,"assets":[{"name":"release-manifest.json"}]}]
                """.formatted(tag);
        String manifest = """
                {
                  "schemaVersion": 1,
                  "name": "autark-os",
                  "version": "%s",
                  "tag": "%s",
                  "channel": "beta",
                  "releaseNotesUrl": "https://github.com/autark-labs/autark-os/releases/tag/%s",
                  "source": {"repository": "autark-labs/autark-os"},
                  "artifacts": [{
                    "type": "tarball",
                    "fileName": "%s",
                    "url": "%s",
                    "sizeBytes": %d,
                    "sha256": "%s",
                    "architecture": "%s"
                  }]
                }
                """.formatted(
                        version,
                        tag,
                        tag,
                        filename,
                        artifactUrl,
                        archive.length,
                        sha256(archive),
                        architecture);
        CoreUpdateReleaseClient client = client(
                "0.9.1-beta.16",
                "beta",
                new FixtureTransport(releases, manifest, archive));

        CoreUpdateService.ManagedRelease candidate = client.findUpdate().orElseThrow();
        Path destination = tempDir.resolve("inbox/candidate.tar.gz");
        client.download(candidate, destination);

        assertThat(candidate.version()).isEqualTo(version);
        assertThat(candidate.architecture()).isEqualTo(architecture);
        assertThat(Files.readAllBytes(destination)).isEqualTo(archive);
    }

    @Test
    void ignoresDraftReleases() {
        CoreUpdateReleaseClient client = client(
                "0.9.1-beta.16",
                "beta",
                new FixtureTransport(
                        "[{\"tag_name\":\"v0.9.1-beta.17\",\"draft\":true,\"prerelease\":true,\"assets\":[{\"name\":\"release-manifest.json\"}]}]",
                        "{}",
                        new byte[0]));

        assertThat(client.findUpdate()).isEmpty();
    }

    @Test
    void ignoresLegacyPrereleasesWithoutTheManagedReleaseManifest() {
        CoreUpdateReleaseClient client = client(
                "0.9.1-beta.16",
                "beta",
                new FixtureTransport(
                        """
                        [
                          {"tag_name":"0.5.0","draft":false,"prerelease":true,"assets":[]},
                          {"tag_name":"v0.1.0-beta.1","draft":false,"prerelease":true,"assets":[]}
                        ]
                        """,
                        "{}",
                        new byte[0]));

        assertThat(client.findUpdate()).isEmpty();
    }

    @Test
    void rejectsAnArtifactOutsideTheExactPublishedRepositoryAndTag() {
        String architecture = architecture();
        String version = "0.9.1-beta.17";
        String tag = "v" + version;
        String releases = """
                [{"tag_name":"%s","draft":false,"prerelease":true,"assets":[{"name":"release-manifest.json"}]}]
                """.formatted(tag);
        String manifest = """
                {
                  "schemaVersion": 1,
                  "name": "autark-os",
                  "version": "%s",
                  "tag": "%s",
                  "channel": "beta",
                  "source": {"repository": "autark-labs/autark-os"},
                  "artifacts": [{
                    "type": "tarball",
                    "fileName": "autark-os-%s-%s.tar.gz",
                    "url": "https://example.invalid/update.tar.gz",
                    "sizeBytes": 7,
                    "sha256": "%s",
                    "architecture": "%s"
                  }]
                }
                """.formatted(
                        version,
                        tag,
                        version,
                        architecture,
                        "a".repeat(64),
                        architecture);
        CoreUpdateReleaseClient client = client(
                "0.9.1-beta.16",
                "beta",
                new FixtureTransport(releases, manifest, new byte[0]));

        assertThatThrownBy(client::findUpdate)
                .isInstanceOf(CoreUpdateException.class)
                .hasMessageContaining("invalid release information");
    }

    @Test
    void comparesStableAndPrereleaseVersionsWithoutLexicalNumberErrors() {
        assertThat(CoreUpdateReleaseClient.isNewer("0.9.1-beta.16", "0.9.1-beta.9")).isTrue();
        assertThat(CoreUpdateReleaseClient.isNewer("0.9.2", "0.9.2-beta.4")).isTrue();
        assertThat(CoreUpdateReleaseClient.isNewer("0.9.1-beta.9", "0.9.1-beta.16")).isFalse();
        assertThat(CoreUpdateReleaseClient.isNewer("0.9.2", "0.9.2")).isFalse();
    }

    private CoreUpdateReleaseClient client(
            String version,
            String channel,
            CoreUpdateReleaseClient.HttpTransport transport) {
        ProjectVersionService versionService = mock(ProjectVersionService.class);
        when(versionService.info()).thenReturn(new ProjectVersionInfo(
                version,
                "build",
                "2026-07-26T00:00:00Z",
                "/opt/autark-os",
                "/var/lib/autark-os",
                "instance",
                "instance",
                "runtime",
                "/opt/autark-os/backend/autark-os-backend.jar",
                channel,
                "check_required",
                "",
                Instant.parse("2026-07-26T00:00:00Z")));
        return new CoreUpdateReleaseClient(
                versionService,
                new ObjectMapper(),
                transport,
                "autark-labs/autark-os");
    }

    private static String architecture() {
        String architecture = System.getProperty("os.arch", "").toLowerCase();
        return architecture.equals("aarch64") || architecture.equals("arm64")
                ? "arm64"
                : "amd64";
    }

    private static String sha256(byte[] value) throws Exception {
        return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(value));
    }

    private record FixtureTransport(
            String releases,
            String manifest,
            byte[] archive)
            implements CoreUpdateReleaseClient.HttpTransport {

        @Override
        public byte[] get(URI uri, long maximumBytes) {
            String value = uri.getHost().equals("api.github.com")
                    ? releases
                    : manifest;
            return value.getBytes(StandardCharsets.UTF_8);
        }

        @Override
        public InputStream stream(URI uri) {
            return new ByteArrayInputStream(archive);
        }
    }
}

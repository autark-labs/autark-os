package com.autarkos.system;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Resolves deliberately published CE releases. Draft workflow artifacts and
 * caller-provided URLs are never update candidates.
 */
@Component
final class CoreUpdateReleaseClient implements CoreUpdateService.ReleaseSource {

    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(30);
    private static final long MAX_MANIFEST_BYTES = 1024 * 1024;
    private static final long MAX_ARCHIVE_BYTES = 512L * 1024 * 1024;
    private static final Pattern SAFE_REPOSITORY = Pattern.compile("[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+");
    private static final Pattern SAFE_TAG = Pattern.compile("v[0-9A-Za-z][0-9A-Za-z._+-]{0,127}");
    private static final Pattern SAFE_VERSION = Pattern.compile("[0-9][0-9A-Za-z._+-]{0,127}");
    private static final Pattern SHA256 = Pattern.compile("[a-f0-9]{64}");

    private final ProjectVersionService versionService;
    private final ObjectMapper objectMapper;
    private final HttpTransport transport;
    private final String repository;

    @Autowired
    CoreUpdateReleaseClient(
            ProjectVersionService versionService,
            @Value("${autark-os.update.repository:autark-labs/autark-os}") String repository) {
        this(versionService, new ObjectMapper(), new JavaHttpTransport(), repository);
    }

    CoreUpdateReleaseClient(
            ProjectVersionService versionService,
            ObjectMapper objectMapper,
            HttpTransport transport,
            String repository) {
        this.versionService = versionService;
        this.objectMapper = objectMapper;
        this.transport = transport;
        this.repository = requireRepository(repository);
    }

    @Override
    public CoreUpdateService.ReleaseContext context() {
        ProjectVersionInfo version = versionService.info();
        return new CoreUpdateService.ReleaseContext(
                version.version(),
                releaseChannel(version.updateChannel()),
                architecture());
    }

    @Override
    public Optional<CoreUpdateService.ManagedRelease> findUpdate() {
        CoreUpdateService.ReleaseContext context = context();
        JsonNode release = publishedRelease(context.channel());
        if (release == null) {
            return Optional.empty();
        }
        String tag = text(release, "tag_name");
        if (!SAFE_TAG.matcher(tag).matches()) {
            throw unavailable("release_metadata_invalid", "Autark-OS received invalid release information.");
        }
        URI manifestUri = URI.create(
                "https://github.com/" + repository + "/releases/download/" + tag + "/release-manifest.json");
        JsonNode manifest = json(transport.get(manifestUri, MAX_MANIFEST_BYTES));
        CoreUpdateService.ManagedRelease candidate = parseManifest(manifest, tag, context);
        return isNewer(candidate.version(), context.installedVersion())
                ? Optional.of(candidate)
                : Optional.empty();
    }

    @Override
    public void download(CoreUpdateService.ManagedRelease release, Path destination) {
        try {
            Files.createDirectories(destination.getParent());
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long written = 0;
            try (InputStream input = transport.stream(release.artifactUri());
                    var output = Files.newOutputStream(destination,
                            StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                byte[] buffer = new byte[8192];
                for (int count; (count = input.read(buffer)) != -1;) {
                    written += count;
                    if (written > MAX_ARCHIVE_BYTES) {
                        throw unavailable("release_too_large", "The Autark-OS update is larger than supported.");
                    }
                    digest.update(buffer, 0, count);
                    output.write(buffer, 0, count);
                }
            }
            if (release.sizeBytes() > 0 && written != release.sizeBytes()) {
                Files.deleteIfExists(destination);
                throw unavailable("release_size_mismatch", "The downloaded Autark-OS update was incomplete.");
            }
            String actual = HexFormat.of().formatHex(digest.digest());
            if (!MessageDigest.isEqual(actual.getBytes(), release.sha256().getBytes())) {
                Files.deleteIfExists(destination);
                throw unavailable("release_checksum_mismatch", "The downloaded Autark-OS update did not pass verification.");
            }
        } catch (CoreUpdateException exception) {
            throw exception;
        } catch (Exception exception) {
            try {
                Files.deleteIfExists(destination);
            } catch (IOException ignored) {
                // The root helper will reject a stale or incomplete inbox file.
            }
            throw unavailable("release_download_failed", "Autark-OS could not download the published update.");
        }
    }

    private JsonNode publishedRelease(String channel) {
        URI uri = "stable".equals(channel)
                ? URI.create("https://api.github.com/repos/" + repository + "/releases/latest")
                : URI.create("https://api.github.com/repos/" + repository + "/releases?per_page=30");
        JsonNode response = json(transport.get(uri, MAX_MANIFEST_BYTES));
        if ("stable".equals(channel)) {
            return response.path("draft").asBoolean(true)
                    || response.path("prerelease").asBoolean(true)
                    || !eligibleRelease(response)
                    ? null
                    : response;
        }
        if (!response.isArray()) {
            throw unavailable("release_metadata_invalid", "Autark-OS received invalid release information.");
        }
        for (JsonNode release : response) {
            if (!release.path("draft").asBoolean(true)
                    && release.path("prerelease").asBoolean(false)
                    && eligibleRelease(release)) {
                return release;
            }
        }
        return null;
    }

    private boolean eligibleRelease(JsonNode release) {
        if (!SAFE_TAG.matcher(text(release, "tag_name")).matches()) {
            return false;
        }
        for (JsonNode asset : release.path("assets")) {
            if ("release-manifest.json".equals(text(asset, "name"))) {
                return true;
            }
        }
        return false;
    }

    private CoreUpdateService.ManagedRelease parseManifest(
            JsonNode manifest,
            String tag,
            CoreUpdateService.ReleaseContext context) {
        if (manifest.path("schemaVersion").asInt() != 1
                || !"autark-os".equals(text(manifest, "name"))
                || !context.channel().equals(text(manifest, "channel"))
                || !tag.equals(text(manifest, "tag"))
                || !repository.equals(manifest.path("source").path("repository").asText())) {
            throw unavailable("release_metadata_invalid", "Autark-OS received invalid release information.");
        }
        String version = text(manifest, "version");
        if (!SAFE_VERSION.matcher(version).matches() || !tag.equals("v" + version)) {
            throw unavailable("release_metadata_invalid", "Autark-OS received invalid release information.");
        }
        String expectedName = "autark-os-" + version + "-" + context.architecture() + ".tar.gz";
        JsonNode artifact = null;
        for (JsonNode value : manifest.path("artifacts")) {
            if (expectedName.equals(text(value, "fileName"))
                    && context.architecture().equals(text(value, "architecture"))
                    && "tarball".equals(text(value, "type"))) {
                artifact = value;
                break;
            }
        }
        if (artifact == null) {
            throw unavailable("release_architecture_missing", "No compatible Autark-OS update was published for this server.");
        }
        String sha256 = text(artifact, "sha256").toLowerCase(Locale.ROOT);
        URI artifactUri = safeArtifactUri(text(artifact, "url"), tag, expectedName);
        if (!SHA256.matcher(sha256).matches()) {
            throw unavailable("release_metadata_invalid", "Autark-OS received invalid release information.");
        }
        long sizeBytes = artifact.path("sizeBytes").asLong(-1);
        if (sizeBytes <= 0 || sizeBytes > MAX_ARCHIVE_BYTES) {
            throw unavailable("release_metadata_invalid", "Autark-OS received invalid release information.");
        }
        String notes = releaseNotesUrl(manifest.path("releaseNotesUrl").asText(""), tag);
        return new CoreUpdateService.ManagedRelease(
                version,
                context.channel(),
                notes,
                context.architecture(),
                artifactUri,
                sha256,
                sizeBytes);
    }

    private URI safeArtifactUri(String value, String tag, String filename) {
        URI expected = URI.create(
                "https://github.com/" + repository + "/releases/download/" + tag + "/" + filename);
        URI actual;
        try {
            actual = URI.create(value);
        } catch (RuntimeException exception) {
            throw unavailable("release_metadata_invalid", "Autark-OS received invalid release information.");
        }
        if (!expected.equals(actual)) {
            throw unavailable("release_metadata_invalid", "Autark-OS received invalid release information.");
        }
        return actual;
    }

    private String releaseNotesUrl(String value, String tag) {
        String expected = "https://github.com/" + repository + "/releases/tag/" + tag;
        return expected.equals(value) ? value : expected;
    }

    private JsonNode json(byte[] value) {
        try {
            return objectMapper.readTree(value);
        } catch (IOException exception) {
            throw unavailable("release_metadata_invalid", "Autark-OS received invalid release information.");
        }
    }

    private static String text(JsonNode value, String field) {
        return value.path(field).asText("").trim();
    }

    private static String requireRepository(String value) {
        String candidate = value == null ? "" : value.trim();
        if (!SAFE_REPOSITORY.matcher(candidate).matches()) {
            throw new IllegalArgumentException("Invalid Autark-OS update repository");
        }
        return candidate;
    }

    private static String releaseChannel(String value) {
        return "stable".equalsIgnoreCase(value) ? "stable" : "beta";
    }

    private static String architecture() {
        return switch (System.getProperty("os.arch", "").toLowerCase(Locale.ROOT)) {
            case "amd64", "x86_64" -> "amd64";
            case "aarch64", "arm64" -> "arm64";
            default -> throw unavailable(
                    "architecture_unsupported",
                    "Autark-OS updates are not published for this processor architecture.");
        };
    }

    static boolean isNewer(String candidate, String installed) {
        return compareVersions(candidate, installed) > 0;
    }

    private static int compareVersions(String left, String right) {
        List<String> leftParts = versionParts(left);
        List<String> rightParts = versionParts(right);
        int length = Math.max(leftParts.size(), rightParts.size());
        for (int index = 0; index < length; index++) {
            String a = index < leftParts.size() ? leftParts.get(index) : "0";
            String b = index < rightParts.size() ? rightParts.get(index) : "0";
            boolean aNumber = a.chars().allMatch(Character::isDigit);
            boolean bNumber = b.chars().allMatch(Character::isDigit);
            int compared;
            if (aNumber && bNumber) {
                compared = new BigInteger(a).compareTo(new BigInteger(b));
            } else if (aNumber != bNumber) {
                compared = aNumber ? 1 : -1;
            } else {
                compared = a.compareToIgnoreCase(b);
            }
            if (compared != 0) {
                return compared;
            }
        }
        return 0;
    }

    private static List<String> versionParts(String value) {
        String safe = value == null ? "" : value.toLowerCase(Locale.ROOT);
        return Pattern.compile("[._+-]").splitAsStream(safe).filter(part -> !part.isBlank()).toList();
    }

    private static CoreUpdateException unavailable(String code, String message) {
        return new CoreUpdateException(code, message, HttpStatus.SERVICE_UNAVAILABLE);
    }

    interface HttpTransport {
        byte[] get(URI uri, long maximumBytes);

        InputStream stream(URI uri);
    }

    private static final class JavaHttpTransport implements HttpTransport {
        private final HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();

        @Override
        public byte[] get(URI uri, long maximumBytes) {
            HttpResponse<byte[]> response = send(uri, HttpResponse.BodyHandlers.ofByteArray());
            if (response.body().length > maximumBytes) {
                throw unavailable("release_metadata_too_large", "Autark-OS received invalid release information.");
            }
            return response.body();
        }

        @Override
        public InputStream stream(URI uri) {
            return send(uri, HttpResponse.BodyHandlers.ofInputStream()).body();
        }

        private <T> HttpResponse<T> send(URI uri, HttpResponse.BodyHandler<T> handler) {
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(REQUEST_TIMEOUT)
                    .header("Accept", "application/vnd.github+json")
                    .header("X-GitHub-Api-Version", "2022-11-28")
                    .header("User-Agent", "Autark-OS appliance updater")
                    .GET()
                    .build();
            try {
                HttpResponse<T> response = client.send(request, handler);
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    throw unavailable("release_service_unavailable", "Autark-OS could not reach the published update channel.");
                }
                return response;
            } catch (CoreUpdateException exception) {
                throw exception;
            } catch (Exception exception) {
                if (exception instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                throw unavailable("release_service_unavailable", "Autark-OS could not reach the published update channel.");
            }
        }
    }
}

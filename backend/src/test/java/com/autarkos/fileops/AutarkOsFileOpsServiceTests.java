package com.autarkos.fileops;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;

class AutarkOsFileOpsServiceTests {

    @TempDir
    Path tempDir;

    @Test
    void clearsOnlyTheSelectedAppDirectory() throws Exception {
        RuntimeLayout layout = layout();
        Files.createDirectories(layout.appRoot("freshrss").resolve("data"));
        Files.writeString(layout.appRoot("freshrss").resolve("data/db"), "data");
        Files.createDirectories(layout.appRoot("homepage"));
        new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations()).clearAppRuntime("freshrss");
        assertThat(layout.appRoot("freshrss")).isEmptyDirectory();
        assertThat(layout.appRoot("homepage")).exists();
    }

    @Test
    void rejectsPathsOutsideManagedStorage() {
        AutarkOsFileOpsService service = new AutarkOsFileOpsService(layout(), new LocalAutarkOsFileOperations());
        assertThatThrownBy(() -> service.clearAppRuntime("../outside")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.restoreAppData(tempDir.resolve("outside.zip"), "app", "freshrss"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void localArchiveRoundTripPreservesModesOwnersAndEmptyDirectories() throws Exception {
        Path source = tempDir.resolve("source");
        Path data = source.resolve("data/settings.db");
        Path empty = source.resolve("data/empty-state");
        Files.createDirectories(empty);
        Files.writeString(data, "secret settings");
        Files.setPosixFilePermissions(source.resolve("data"), PosixFilePermissions.fromString("rwxr-x---"));
        Files.setPosixFilePermissions(data, PosixFilePermissions.fromString("rw-r-----"));
        Files.setPosixFilePermissions(empty, PosixFilePermissions.fromString("rwx------"));
        Path archive = tempDir.resolve("backup.zip");
        Path destination = tempDir.resolve("restored");

        LocalAutarkOsFileOperations operations = new LocalAutarkOsFileOperations();
        operations.createPrefixedArchive(java.util.Map.of("data", source.resolve("data")), archive);
        operations.restoreAppData(archive, "app", "vaultwarden", destination);

        assertThat(Files.readString(destination.resolve("data/settings.db"))).isEqualTo("secret settings");
        assertThat(destination.resolve("data/empty-state")).isDirectory();
        assertThat(Files.getPosixFilePermissions(destination.resolve("data/settings.db")))
                .isEqualTo(PosixFilePermissions.fromString("rw-r-----"));
        assertThat(Files.getPosixFilePermissions(destination.resolve("data/empty-state")))
                .isEqualTo(PosixFilePermissions.fromString("rwx------"));
        assertThat(Files.getAttribute(destination.resolve("data/settings.db"), "unix:uid"))
                .isEqualTo(Files.getAttribute(data, "unix:uid"));
        assertThat(Files.getAttribute(destination.resolve("data/settings.db"), "unix:gid"))
                .isEqualTo(Files.getAttribute(data, "unix:gid"));
        assertThat(ArchiveFilesystemMetadata.read(archive)).extracting(ArchiveFilesystemMetadata.Entry::path)
                .contains("data", "data/settings.db", "data/empty-state");
    }

    @Test
    void localRestoreRejectsLegacyArchiveWithoutFilesystemMetadata() throws Exception {
        Path archive = tempDir.resolve("legacy.zip");
        try (java.util.zip.ZipOutputStream zip = new java.util.zip.ZipOutputStream(Files.newOutputStream(archive))) {
            zip.putNextEntry(new java.util.zip.ZipEntry("data/settings.db"));
            zip.write("legacy".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            zip.closeEntry();
        }

        assertThatThrownBy(() -> new LocalAutarkOsFileOperations().restoreAppData(archive, "app", "vaultwarden", tempDir.resolve("restored")))
                .isInstanceOf(java.io.IOException.class)
                .hasMessageContaining("missing filesystem metadata");
    }

    @Test
    void localArchiveRejectsSymbolicLinksInsteadOfSilentlyOmittingThem() throws Exception {
        Path source = tempDir.resolve("source");
        Files.createDirectories(source);
        Files.writeString(source.resolve("included-before-failure.txt"), "partial data");
        Files.writeString(tempDir.resolve("outside.txt"), "outside");
        Files.createSymbolicLink(source.resolve("linked.txt"), tempDir.resolve("outside.txt"));
        Path archive = tempDir.resolve("backup.zip");

        assertThatThrownBy(() -> new LocalAutarkOsFileOperations().createPrefixedArchive(java.util.Map.of("data", source), archive))
                .isInstanceOf(java.io.IOException.class)
                .hasMessageContaining("symbolic links");
        assertThat(archive).doesNotExist();
        try (var files = Files.list(tempDir)) {
            assertThat(files.map(path -> path.getFileName().toString()))
                    .noneMatch(name -> name.startsWith(".backup.zip-") && name.endsWith(".tmp"));
        }
    }

    private RuntimeLayout layout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(tempDir.resolve("runtime").toString());
        return new RuntimeLayout(properties);
    }

}

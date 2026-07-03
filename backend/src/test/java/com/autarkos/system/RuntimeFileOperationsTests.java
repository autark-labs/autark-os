package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.zip.ZipInputStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class RuntimeFileOperationsTests {

    @TempDir
    Path tempDir;

    private final RuntimeFileOperations files = new RuntimeFileOperations();

    @Test
    void measuresReadableRegularFiles() throws Exception {
        Path source = tempDir.resolve("source");
        Files.createDirectories(source.resolve("nested"));
        Files.writeString(source.resolve("one.txt"), "one");
        Files.writeString(source.resolve("nested/two.txt"), "two");

        assertThat(files.directorySize(source)).isEqualTo(6);
        assertThat(files.directorySize(tempDir.resolve("missing"))).isZero();
    }

    @Test
    void archivesDirectoryWithRelativeEntries() throws Exception {
        Path source = tempDir.resolve("source");
        Files.createDirectories(source.resolve("nested"));
        Files.writeString(source.resolve("nested/file.txt"), "content");
        Path destination = tempDir.resolve("archive.zip");

        long size = files.zipDirectory(source, destination);

        assertThat(size).isPositive();
        assertThat(zipEntries(destination)).containsExactly("nested/file.txt");
    }

    @Test
    void archivesMultipleDirectoriesUnderPrefixes() throws Exception {
        Path first = tempDir.resolve("first");
        Path second = tempDir.resolve("second");
        Files.createDirectories(first);
        Files.createDirectories(second);
        Files.writeString(first.resolve("a.txt"), "a");
        Files.writeString(second.resolve("b.txt"), "b");
        Path destination = tempDir.resolve("full.zip");

        files.zipDirectories(Map.of("one", first, "two", second), destination);

        assertThat(zipEntries(destination)).containsExactlyInAnyOrder("one/a.txt", "two/b.txt");
    }

    @Test
    void deletesDirectoryRecursively() throws Exception {
        Path source = tempDir.resolve("source");
        Files.createDirectories(source.resolve("nested"));
        Files.writeString(source.resolve("nested/file.txt"), "content");

        files.deleteRecursively(source);

        assertThat(source).doesNotExist();
    }

    private java.util.List<String> zipEntries(Path archive) throws Exception {
        java.util.ArrayList<String> entries = new java.util.ArrayList<>();
        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(archive))) {
            java.util.zip.ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                entries.add(entry.getName());
            }
        }
        return entries;
    }
}

package com.projectos.system;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Comparator;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.springframework.stereotype.Component;

@Component
public class RuntimeFileOperations {

    public long directorySize(Path path) {
        if (!Files.exists(path)) {
            return 0;
        }
        AtomicLong total = new AtomicLong();
        try {
            Files.walkFileTree(path, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    if (attrs.isRegularFile()) {
                        total.addAndGet(attrs.size());
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exception) {
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attrs) {
                    return Files.isReadable(directory) ? FileVisitResult.CONTINUE : FileVisitResult.SKIP_SUBTREE;
                }
            });
        } catch (IOException | SecurityException ignored) {
            return total.get();
        }
        return total.get();
    }

    public long zipDirectory(Path source, Path destination) throws IOException {
        AtomicLong writtenBytes = new AtomicLong();
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(destination))) {
            writeDirectory(zip, source, null, writtenBytes);
        }
        return archiveSize(destination, writtenBytes);
    }

    public long zipDirectories(Map<String, Path> prefixedSources, Path destination) throws IOException {
        AtomicLong writtenBytes = new AtomicLong();
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(destination))) {
            for (Map.Entry<String, Path> entry : prefixedSources.entrySet()) {
                writeDirectory(zip, entry.getValue(), entry.getKey(), writtenBytes);
            }
        }
        return archiveSize(destination, writtenBytes);
    }

    public void deleteRecursively(Path path) throws IOException {
        if (!Files.exists(path)) {
            return;
        }
        try (var paths = Files.walk(path)) {
            for (Path child : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(child);
            }
        }
    }

    private void writeDirectory(ZipOutputStream zip, Path source, String prefix, AtomicLong writtenBytes) throws IOException {
        Files.walkFileTree(source, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                if (!attrs.isRegularFile() || !Files.isReadable(file)) {
                    return FileVisitResult.CONTINUE;
                }
                Path relative = source.relativize(file);
                String entryName = prefix == null || prefix.isBlank() ? relative.toString() : prefix + "/" + relative;
                zip.putNextEntry(new ZipEntry(entryName));
                long copied = Files.copy(file, zip);
                writtenBytes.addAndGet(copied);
                zip.closeEntry();
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exception) {
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attrs) {
                return Files.isReadable(directory) ? FileVisitResult.CONTINUE : FileVisitResult.SKIP_SUBTREE;
            }
        });
    }

    private long archiveSize(Path destination, AtomicLong writtenBytes) throws IOException {
        long archiveSize = Files.size(destination);
        return archiveSize > 0 ? archiveSize : writtenBytes.get();
    }
}

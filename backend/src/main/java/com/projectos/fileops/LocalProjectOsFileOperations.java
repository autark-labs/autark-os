package com.projectos.fileops;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import java.util.concurrent.atomic.AtomicLong;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import org.springframework.stereotype.Component;

@Component
public class LocalProjectOsFileOperations implements ProjectOsFileOperations {

    public LocalProjectOsFileOperations() {
    }

    @Override
    public long createArchive(Path source, Path destination) throws IOException {
        return zipStrict(Map.of("", source), destination);
    }

    @Override
    public long createPrefixedArchive(Map<String, Path> sources, Path destination) throws IOException {
        return zipStrict(sources, destination);
    }

    @Override
    public void clearDirectoryContents(Path directory) throws IOException {
        if (!Files.exists(directory)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(directory)) {
            List<Path> sorted = paths.sorted(Comparator.reverseOrder()).toList();
            for (Path path : sorted) {
                if (!path.equals(directory)) {
                    Files.deleteIfExists(path);
                }
            }
        }
    }

    @Override
    public void deleteBackup(Path backupPath) throws IOException {
        Files.deleteIfExists(backupPath);
    }

    @Override
    public void restoreAppData(Path archive, String scope, String appId, Path destination) throws IOException {
        clearDirectoryContents(destination);
        Files.createDirectories(destination);
        extractAppArchive(archive, scope, appId, destination);
    }

    private void extractAppArchive(Path archive, String scope, String appId, Path destination) throws IOException {
        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    zip.closeEntry();
                    continue;
                }
                String name = entry.getName();
                if ("full".equals(scope)) {
                    String prefix = appId + "/";
                    if (!name.startsWith(prefix)) {
                        zip.closeEntry();
                        continue;
                    }
                    name = name.substring(prefix.length());
                }
                if (name.isBlank()) {
                    zip.closeEntry();
                    continue;
                }
                Path target = destination.resolve(name).normalize();
                if (!target.startsWith(destination)) {
                    throw new IOException("Restore point contains an unsafe file path.");
                }
                Files.createDirectories(target.getParent());
                Files.copy(zip, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                zip.closeEntry();
            }
        }
    }

    private long zipStrict(Map<String, Path> sources, Path destination) throws IOException {
        AtomicLong writtenBytes = new AtomicLong();
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(destination))) {
            for (Map.Entry<String, Path> source : sources.entrySet()) {
                writeDirectoryStrict(zip, source.getValue(), source.getKey(), writtenBytes);
            }
        }
        long archiveSize = Files.size(destination);
        return archiveSize > 0 ? archiveSize : writtenBytes.get();
    }

    private void writeDirectoryStrict(ZipOutputStream zip, Path source, String prefix, AtomicLong writtenBytes) throws IOException {
        Files.walkFileTree(source, new SimpleFileVisitor<>() {
            @Override
            public java.nio.file.FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attrs) throws IOException {
                if (!Files.isReadable(directory)) {
                    throw new java.nio.file.AccessDeniedException(directory.toString());
                }
                return java.nio.file.FileVisitResult.CONTINUE;
            }

            @Override
            public java.nio.file.FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                if (!attrs.isRegularFile()) {
                    return java.nio.file.FileVisitResult.CONTINUE;
                }
                if (!Files.isReadable(file)) {
                    throw new java.nio.file.AccessDeniedException(file.toString());
                }
                Path relative = source.relativize(file);
                String entryName = prefix == null || prefix.isBlank() ? relative.toString() : prefix + "/" + relative;
                zip.putNextEntry(new ZipEntry(entryName));
                long copied = Files.copy(file, zip);
                writtenBytes.addAndGet(copied);
                zip.closeEntry();
                return java.nio.file.FileVisitResult.CONTINUE;
            }

            @Override
            public java.nio.file.FileVisitResult visitFileFailed(Path file, IOException exception) throws IOException {
                throw exception;
            }
        });
    }
}

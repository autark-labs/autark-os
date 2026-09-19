package com.autarkos.fileops;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.StandardCopyOption;
import java.nio.file.SimpleFileVisitor;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import java.util.concurrent.atomic.AtomicLong;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.PosixFilePermission;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import org.springframework.stereotype.Component;

@Component
public class LocalAutarkOsFileOperations implements AutarkOsFileOperations {

    public LocalAutarkOsFileOperations() {
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
        Path parent = destination.toAbsolutePath().normalize().getParent();
        if (parent == null) {
            throw new IOException("Restore destination has no parent folder.");
        }
        Files.createDirectories(parent);
        Path staging = Files.createTempDirectory(parent, ".autark-os-restore-");
        Path previous = Files.createTempDirectory(parent, ".autark-os-previous-");
        List<Path> applied = new java.util.ArrayList<>();
        List<Path> preserved = new java.util.ArrayList<>();
        try {
            List<ArchiveFilesystemMetadata.Entry> metadata = ArchiveFilesystemMetadata.forRestore(
                    ArchiveFilesystemMetadata.read(archive), scope, appId);
            extractAppArchive(archive, scope, appId, staging, metadata);
            if (!containsRestorableEntries(staging)) {
                throw new IOException("Restore point does not contain restorable app data.");
            }
            applyFilesystemMetadata(staging, metadata);
            Files.createDirectories(destination);
            try (Stream<Path> children = Files.list(staging)) {
                for (Path child : children.toList()) {
                    Path target = destination.resolve(child.getFileName().toString());
                    if (Files.exists(target)) {
                        move(target, previous.resolve(child.getFileName().toString()));
                        preserved.add(target);
                    }
                    move(child, target);
                    applied.add(target);
                }
            }
        } catch (IOException exception) {
            for (Path target : applied.reversed()) {
                if (Files.exists(target)) {
                    deleteRecursively(target);
                }
            }
            for (Path target : preserved.reversed()) {
                Path saved = previous.resolve(target.getFileName().toString());
                if (Files.exists(saved)) {
                    move(saved, target);
                }
            }
            throw exception;
        } finally {
            if (Files.exists(staging)) {
                deleteRecursively(staging);
            }
            if (Files.exists(previous)) {
                deleteRecursively(previous);
            }
        }
    }

    private void extractAppArchive(Path archive, String scope, String appId, Path destination, List<ArchiveFilesystemMetadata.Entry> metadata) throws IOException {
        java.util.Set<String> expected = metadata.stream().map(ArchiveFilesystemMetadata.Entry::path).collect(java.util.stream.Collectors.toSet());
        java.util.Set<String> extracted = new java.util.HashSet<>();
        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName();
                if (ArchiveFilesystemMetadata.ENTRY_NAME.equals(name)) {
                    zip.closeEntry();
                    continue;
                }
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
                String metadataName = name.endsWith("/") ? name.substring(0, name.length() - 1) : name;
                if (!expected.contains(metadataName)) {
                    throw new IOException("Restore point contents do not match filesystem metadata.");
                }
                if (entry.isDirectory()) {
                    Files.createDirectories(target);
                } else {
                    Files.createDirectories(target.getParent());
                    Files.copy(zip, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                }
                extracted.add(metadataName);
                zip.closeEntry();
            }
        }
        if (!extracted.equals(expected)) {
            throw new IOException("Restore point contents do not match filesystem metadata.");
        }
    }

    private boolean containsRestorableEntries(Path directory) throws IOException {
        try (Stream<Path> paths = Files.walk(directory)) {
            return paths.anyMatch(path -> !path.equals(directory));
        }
    }

    private void applyFilesystemMetadata(Path destination, List<ArchiveFilesystemMetadata.Entry> metadata) throws IOException {
        for (ArchiveFilesystemMetadata.Entry entry : metadata.stream().filter(entry -> "file".equals(entry.type())).toList()) {
            applyFilesystemMetadata(destination.resolve(entry.path()), entry);
        }
        for (ArchiveFilesystemMetadata.Entry entry : metadata.stream().filter(entry -> "directory".equals(entry.type())).toList()) {
            applyFilesystemMetadata(destination.resolve(entry.path()), entry);
        }
    }

    private void applyFilesystemMetadata(Path path, ArchiveFilesystemMetadata.Entry entry) throws IOException {
        Files.setPosixFilePermissions(path, ArchiveFilesystemMetadata.permissions(entry.mode()));
        long currentUid = ((Number) Files.getAttribute(path, "unix:uid")).longValue();
        long currentGid = ((Number) Files.getAttribute(path, "unix:gid")).longValue();
        if (currentUid != entry.uid() || currentGid != entry.gid()) {
            throw new java.nio.file.AccessDeniedException(path.toString(), null,
                    "Restoring this app requires the bounded Autark-OS file helper to preserve ownership.");
        }
    }

    private void move(Path source, Path destination) throws IOException {
        try {
            Files.move(source, destination, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException exception) {
            Files.move(source, destination);
        }
    }

    private void deleteRecursively(Path directory) throws IOException {
        try (Stream<Path> paths = Files.walk(directory)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    private long zipStrict(Map<String, Path> sources, Path destination) throws IOException {
        AtomicLong writtenBytes = new AtomicLong();
        Path parent = destination.toAbsolutePath().normalize().getParent();
        if (parent == null) {
            throw new IOException("Backup destination has no parent folder.");
        }
        Path staging = Files.createTempFile(parent, "." + destination.getFileName() + "-", ".tmp");
        try {
            try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(staging))) {
                List<ArchiveFilesystemMetadata.Entry> metadata = new java.util.ArrayList<>();
                for (Map.Entry<String, Path> source : sources.entrySet()) {
                    writeDirectoryStrict(zip, source.getValue(), source.getKey(), writtenBytes);
                    metadata.addAll(ArchiveFilesystemMetadata.capture(source.getValue(), source.getKey()));
                }
                ArchiveFilesystemMetadata.write(zip, metadata);
            }
            moveArchive(staging, destination);
        } finally {
            Files.deleteIfExists(staging);
        }
        long archiveSize = Files.size(destination);
        return archiveSize > 0 ? archiveSize : writtenBytes.get();
    }

    private void moveArchive(Path source, Path destination) throws IOException {
        try {
            Files.move(source, destination, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException exception) {
            Files.move(source, destination, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private void writeDirectoryStrict(ZipOutputStream zip, Path source, String prefix, AtomicLong writtenBytes) throws IOException {
        if (prefix != null && !prefix.isBlank()) {
            zip.putNextEntry(new ZipEntry(prefix.replace(source.getFileSystem().getSeparator(), "/") + "/"));
            zip.closeEntry();
        }
        Files.walkFileTree(source, new SimpleFileVisitor<>() {
            @Override
            public java.nio.file.FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attrs) throws IOException {
                if (!Files.isReadable(directory)) {
                    throw new java.nio.file.AccessDeniedException(directory.toString());
                }
                if (!directory.equals(source)) {
                    Path relative = source.relativize(directory);
                    String entryName = prefix == null || prefix.isBlank() ? relative.toString() : prefix + "/" + relative;
                    zip.putNextEntry(new ZipEntry(entryName.replace(directory.getFileSystem().getSeparator(), "/") + "/"));
                    zip.closeEntry();
                }
                return java.nio.file.FileVisitResult.CONTINUE;
            }

            @Override
            public java.nio.file.FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                if (Files.isSymbolicLink(file)) {
                    throw new IOException("Backups cannot include symbolic links: " + source.relativize(file));
                }
                if (!attrs.isRegularFile()) {
                    throw new IOException("Backups cannot include unsupported file type: " + source.relativize(file));
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

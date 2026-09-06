package com.autarkos.fileops;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * The small, portable portion of POSIX metadata that ZIP does not preserve.
 * Archives without this entry predate the beta filesystem contract and are not
 * safe to restore over managed application data.
 */
public final class ArchiveFilesystemMetadata {

    public static final String ENTRY_NAME = ".autark-os-filesystem.json";
    private static final int SCHEMA_VERSION = 1;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private ArchiveFilesystemMetadata() {
    }

    public static List<Entry> capture(Path source, String prefix) throws IOException {
        if (!Files.isDirectory(source)) {
            throw new IOException("Backup source is not a directory: " + source);
        }
        List<Entry> entries = new ArrayList<>();
        try (var paths = Files.walk(source)) {
            for (Path path : paths.sorted(Comparator.naturalOrder()).toList()) {
                if (path.equals(source)) {
                    continue;
                }
                if (Files.isSymbolicLink(path)) {
                    throw new IOException("Backups cannot include symbolic links: " + source.relativize(path));
                }
                String relative = source.relativize(path).toString().replace(path.getFileSystem().getSeparator(), "/");
                String archivePath = prefix == null || prefix.isBlank() ? relative : prefix + "/" + relative;
                if (Files.isDirectory(path)) {
                    entries.add(entry(path, archivePath, "directory"));
                } else if (Files.isRegularFile(path)) {
                    entries.add(entry(path, archivePath, "file"));
                } else {
                    throw new IOException("Backups cannot include unsupported file type: " + source.relativize(path));
                }
            }
        }
        return entries;
    }

    public static void write(ZipOutputStream zip, List<Entry> entries) throws IOException {
        zip.putNextEntry(new ZipEntry(ENTRY_NAME));
        zip.write(OBJECT_MAPPER.writeValueAsBytes(new Document(SCHEMA_VERSION, List.copyOf(entries))));
        zip.closeEntry();
    }

    public static List<Entry> read(Path archive) throws IOException {
        try (ZipFile zip = new ZipFile(archive.toFile())) {
            ZipEntry entry = zip.getEntry(ENTRY_NAME);
            if (entry == null || entry.isDirectory()) {
                throw new IOException("Backup archive is missing filesystem metadata. Create a new backup before restoring.");
            }
            Document document = OBJECT_MAPPER.readValue(zip.getInputStream(entry), Document.class);
            if (document == null || document.schemaVersion() != SCHEMA_VERSION || document.entries() == null || document.entries().isEmpty()) {
                throw new IOException("Backup archive has invalid filesystem metadata. Create a new backup before restoring.");
            }
            List<Entry> entries = List.copyOf(document.entries());
            validate(entries);
            return entries;
        }
    }

    public static List<Entry> forRestore(List<Entry> entries, String scope, String appId) throws IOException {
        String prefix = "full".equals(scope) ? appId + "/" : "";
        List<Entry> selected = new ArrayList<>();
        for (Entry entry : entries) {
            if (!prefix.isEmpty()) {
                if (!entry.path().startsWith(prefix)) {
                    continue;
                }
                selected.add(new Entry(entry.path().substring(prefix.length()), entry.type(), entry.mode(), entry.uid(), entry.gid()));
            } else {
                selected.add(entry);
            }
        }
        if (selected.isEmpty()) {
            throw new IOException("Restore point does not contain filesystem metadata for this app.");
        }
        validate(selected);
        return selected;
    }

    public static Set<PosixFilePermission> permissions(int mode) {
        Set<PosixFilePermission> permissions = new LinkedHashSet<>();
        if ((mode & 0400) != 0) permissions.add(PosixFilePermission.OWNER_READ);
        if ((mode & 0200) != 0) permissions.add(PosixFilePermission.OWNER_WRITE);
        if ((mode & 0100) != 0) permissions.add(PosixFilePermission.OWNER_EXECUTE);
        if ((mode & 0040) != 0) permissions.add(PosixFilePermission.GROUP_READ);
        if ((mode & 0020) != 0) permissions.add(PosixFilePermission.GROUP_WRITE);
        if ((mode & 0010) != 0) permissions.add(PosixFilePermission.GROUP_EXECUTE);
        if ((mode & 0004) != 0) permissions.add(PosixFilePermission.OTHERS_READ);
        if ((mode & 0002) != 0) permissions.add(PosixFilePermission.OTHERS_WRITE);
        if ((mode & 0001) != 0) permissions.add(PosixFilePermission.OTHERS_EXECUTE);
        return permissions;
    }

    private static Entry entry(Path path, String archivePath, String type) throws IOException {
        int mode = 0;
        for (PosixFilePermission permission : Files.getPosixFilePermissions(path)) {
            mode |= switch (permission) {
                case OWNER_READ -> 0400;
                case OWNER_WRITE -> 0200;
                case OWNER_EXECUTE -> 0100;
                case GROUP_READ -> 0040;
                case GROUP_WRITE -> 0020;
                case GROUP_EXECUTE -> 0010;
                case OTHERS_READ -> 0004;
                case OTHERS_WRITE -> 0002;
                case OTHERS_EXECUTE -> 0001;
            };
        }
        return new Entry(archivePath, type, mode, unixNumber(path, "uid"), unixNumber(path, "gid"));
    }

    private static long unixNumber(Path path, String attribute) throws IOException {
        Object value = Files.getAttribute(path, "unix:" + attribute);
        if (!(value instanceof Number number)) {
            throw new IOException("Backup filesystem does not expose numeric " + attribute + " values.");
        }
        return number.longValue();
    }

    private static void validate(List<Entry> entries) throws IOException {
        Set<String> paths = new LinkedHashSet<>();
        for (Entry entry : entries) {
            if (entry == null || entry.path() == null || entry.path().isBlank()
                    || entry.path().startsWith("/") || entry.path().contains("\\")
                    || java.util.Arrays.stream(entry.path().split("/")).anyMatch(part -> part.isBlank() || ".".equals(part) || "..".equals(part))
                    || !("file".equals(entry.type()) || "directory".equals(entry.type()))
                    || entry.mode() < 0 || entry.mode() > 0777 || entry.uid() < 0 || entry.gid() < 0
                    || !paths.add(entry.path())) {
                throw new IOException("Backup archive has invalid filesystem metadata.");
            }
        }
    }

    public record Entry(String path, String type, int mode, long uid, long gid) {
    }

    private record Document(int schemaVersion, List<Entry> entries) {
    }
}

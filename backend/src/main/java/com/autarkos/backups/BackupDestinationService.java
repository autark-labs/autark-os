package com.autarkos.backups;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.fileops.AutarkOsFileOpsService;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.ProjectSettingsRepository;

/**
 * The single authority for where Autark-OS can create and read backup archives.
 * Paths in the database are useful product state, but the root helper maintains
 * its own approved-root record before it accepts privileged archive work.
 */
@Service
public class BackupDestinationService {

    static final String DESTINATION_PATH = "backupDestination";
    static final String DESTINATION_IDENTITY = "backupDestinationIdentity";
    static final String DESTINATION_MOUNT_POINT = "backupDestinationMountPoint";
    static final String DESTINATION_FILESYSTEM = "backupDestinationFilesystem";
    static final String DESTINATION_HISTORY = "backupDestinationHistory";
    private static final long MINIMUM_USABLE_SPACE_BYTES = 512L * 1024L * 1024L;
    private static final Set<String> UNSUPPORTED_EXTERNAL_FILESYSTEMS = Set.of(
            "proc", "procfs", "sysfs", "devtmpfs", "tmpfs", "devpts", "cgroup", "cgroup2", "squashfs", "overlay", "ramfs");
    private static final List<Path> SYSTEM_ROOTS = List.of(
            Path.of("/etc"), Path.of("/root"), Path.of("/usr"), Path.of("/bin"), Path.of("/sbin"),
            Path.of("/proc"), Path.of("/sys"), Path.of("/dev"), Path.of("/tmp"));

    private final RuntimeLayout runtimeLayout;
    private final ProjectSettingsRepository settingsRepository;
    private final DestinationConfigurator destinationConfigurator;
    private final DestinationInspector inspector;

    @Autowired
    public BackupDestinationService(RuntimeLayout runtimeLayout, ProjectSettingsRepository settingsRepository, AutarkOsFileOpsService fileOpsService) {
        this(runtimeLayout, settingsRepository, fileOpsService::configureBackupDestination, new NioDestinationInspector());
    }

    BackupDestinationService(
            RuntimeLayout runtimeLayout,
            ProjectSettingsRepository settingsRepository,
            DestinationConfigurator destinationConfigurator,
            DestinationInspector inspector) {
        this.runtimeLayout = runtimeLayout;
        this.settingsRepository = settingsRepository;
        this.destinationConfigurator = destinationConfigurator;
        this.inspector = inspector;
    }

    public BackupModels.BackupDestination current() {
        Map<String, String> values = settingsRepository.readAll();
        Path internal = internalRoot();
        String configured = values.getOrDefault(DESTINATION_PATH, "").trim();
        if (configured.isBlank() || samePath(Path.of(configured), internal)) {
            return inspectInternal(internal);
        }
        return inspectConfiguredExternal(Path.of(configured), values);
    }

    public BackupModels.BackupDestination preview(String requestedPath) {
        Path requested = parseRequestedPath(requestedPath);
        if (samePath(requested, internalRoot())) {
            return inspectInternal(internalRoot());
        }
        return inspectExternal(requested, null, false);
    }

    /** Validates, probes, root-authorizes, then persists the new destination. */
    public synchronized BackupModels.BackupDestination configure(String requestedPath) {
        Path requested = parseRequestedPath(requestedPath);
        Path internal = internalRoot();
        BackupModels.BackupDestination candidate = samePath(requested, internal)
                ? inspectInternal(internal)
                : inspectExternal(requested, null, true);
        if (!candidate.ready()) {
            throw new InstallationException(candidate.message());
        }

        Map<String, String> previousValues = settingsRepository.readAll();
        Path previousPath = configuredRoot(previousValues);
        try {
            if (!samePath(previousPath, Path.of(candidate.configuredPath())) || !"internal".equals(candidate.kind())) {
                destinationConfigurator.configure(candidate, approvedHistory(previousValues));
            }
            Map<String, String> updates = destinationValues(candidate, previousPath, internal, previousValues);
            settingsRepository.saveValues(updates);
            return candidate;
        } catch (IOException exception) {
            throw new InstallationException("Autark-OS could not authorize this backup destination. " + concise(exception), exception);
        } catch (RuntimeException exception) {
            throw exception;
        }
    }

    public Path activeRoot() {
        BackupModels.BackupDestination destination = current();
        if (!destination.ready()) {
            throw new InstallationException(destination.message());
        }
        return Path.of(destination.configuredPath()).toAbsolutePath().normalize();
    }

    /**
     * Existing restore points retain their original path. A previous approved
     * drive may still be read when it is reconnected; otherwise callers get a
     * clear unavailable result instead of silently redirecting to the new root.
     */
    public Path approvedRootForArchive(Path archive) {
        Path normalized = archive.toAbsolutePath().normalize();
        BackupModels.BackupDestination active = current();
        if (isInside(normalized, Path.of(active.configuredPath()))) {
            if (!active.ready()) {
                throw new InstallationException(active.message());
            }
            return Path.of(active.configuredPath()).toAbsolutePath().normalize();
        }
        for (Path previous : approvedHistory(settingsRepository.readAll())) {
            if (isInside(normalized, previous)) {
                return previous;
            }
        }
        throw new InstallationException("This restore point is not stored in an approved Autark-OS backup destination.");
    }

    public boolean archiveAvailable(Path archive) {
        try {
            approvedRootForArchive(archive);
            return Files.isRegularFile(archive);
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private BackupModels.BackupDestination inspectInternal(Path root) {
        try {
            inspector.createDirectories(root);
            Inspection inspection = inspector.inspect(root);
            if (!inspection.writable()) {
                return destination("internal", "read_only", root, inspection, false, "Autark-OS cannot write to its internal backup folder.", "Review storage");
            }
            return destination("internal", "ready", root, inspection, false,
                    "Backups are ready on this device. They help with app recovery but do not protect against a drive failure.", "Choose external drive");
        } catch (IOException exception) {
            return unavailable("internal", root, "unavailable", "Autark-OS cannot prepare its internal backup folder. " + concise(exception), "Review storage");
        }
    }

    private BackupModels.BackupDestination inspectConfiguredExternal(Path path, Map<String, String> values) {
        String expectedIdentity = values.getOrDefault(DESTINATION_IDENTITY, "");
        return inspectExternal(path, expectedIdentity.isBlank() ? null : expectedIdentity, false);
    }

    private BackupModels.BackupDestination inspectExternal(Path requested, String expectedIdentity, boolean probe) {
        try {
            validatePathShape(requested);
            Path existingBase = nearestExistingDirectory(requested);
            Inspection baseInspection = inspector.inspect(existingBase);
            if (expectedIdentity != null && !expectedIdentity.equals(baseInspection.identity())) {
                boolean targetExists = Files.exists(requested);
                return destination("external", targetExists ? "swapped" : "missing", requested, baseInspection, false,
                        targetExists
                                ? "A different backup drive is mounted at this location. Reconnect the approved drive; Autark-OS will not write to the replacement."
                                : "The approved backup drive is not mounted here. Reconnect the same drive; Autark-OS will not fall back to internal storage.",
                        "Reconnect drive");
            }
            if (sameIdentity(baseInspection.identity(), runtimeInspection().identity())) {
                return destination("external", "same_device", requested, baseInspection, false,
                        "This folder is on the same drive as Autark-OS. Choose a mounted external drive for drive-failure protection.", "Choose external drive");
            }
            if (UNSUPPORTED_EXTERNAL_FILESYSTEMS.contains(baseInspection.filesystemType().toLowerCase())) {
                return destination("external", "unsupported_filesystem", requested, baseInspection, false,
                        "This mounted filesystem is not supported for backup archives: " + baseInspection.filesystemType() + ".", "Choose another drive");
            }
            if (probe) {
                inspector.createDirectories(requested);
                rejectSymlinkSegments(requested);
                probeWrite(requested);
            }
            Inspection inspection = inspector.inspect(requested);
            if (!inspection.writable()) {
                return destination("external", "read_only", requested, inspection, false,
                        "The mounted backup drive is read-only for the Autark-OS service user.", "Fix drive permissions");
            }
            if (inspection.usableBytes() < MINIMUM_USABLE_SPACE_BYTES) {
                return destination("external", "insufficient_space", requested, inspection, false,
                        "The backup drive needs at least 512 MB of free space before Autark-OS can create archives.", "Free drive space");
            }
            String message = inspection.identity().startsWith("uuid:")
                    ? "External backup drive is connected and ready."
                    : "External backup drive is ready. Its filesystem does not expose a UUID, so Autark-OS will verify the mounted device identity instead.";
            return destination("external", "ready", requested, inspection, true, message, "Open Backups");
        } catch (InstallationException exception) {
            return unavailable("external", requested, "invalid", exception.getMessage(), "Choose another drive");
        } catch (IOException exception) {
            String status = expectedIdentity == null ? "unavailable" : "missing";
            String message = expectedIdentity == null
                    ? "Autark-OS could not validate this backup destination. " + concise(exception)
                    : "The approved backup drive is unavailable. Reconnect it; Autark-OS will not fall back to internal storage.";
            return unavailable("external", requested, status, message, expectedIdentity == null ? "Review drive" : "Reconnect drive");
        }
    }

    private Map<String, String> destinationValues(BackupModels.BackupDestination candidate, Path previousPath, Path internal, Map<String, String> previousValues) {
        LinkedHashSet<Path> history = new LinkedHashSet<>(approvedHistory(previousValues));
        if (!samePath(previousPath, internal) && !samePath(previousPath, Path.of(candidate.configuredPath()))) {
            history.add(previousPath);
        }
        history.removeIf(path -> samePath(path, Path.of(candidate.configuredPath())) || samePath(path, internal));
        return Map.of(
                DESTINATION_PATH, candidate.configuredPath(),
                DESTINATION_IDENTITY, candidate.deviceIdentity(),
                DESTINATION_MOUNT_POINT, candidate.mountPoint(),
                DESTINATION_FILESYSTEM, candidate.filesystemType(),
                DESTINATION_HISTORY, history.stream().map(Path::toString).collect(java.util.stream.Collectors.joining("\n")));
    }

    private List<Path> approvedHistory(Map<String, String> values) {
        String encoded = values.getOrDefault(DESTINATION_HISTORY, "");
        if (encoded.isBlank()) {
            return List.of();
        }
        return encoded.lines()
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .map(Path::of)
                .map(path -> path.toAbsolutePath().normalize())
                .filter(path -> !samePath(path, internalRoot()))
                .distinct()
                .toList();
    }

    private Path configuredRoot(Map<String, String> values) {
        String configured = values.getOrDefault(DESTINATION_PATH, "");
        return configured.isBlank() ? internalRoot() : Path.of(configured).toAbsolutePath().normalize();
    }

    private Path internalRoot() {
        return runtimeLayout.runtimeRoot().resolve("backups").toAbsolutePath().normalize();
    }

    private Inspection runtimeInspection() throws IOException {
        Path runtime = runtimeLayout.runtimeRoot();
        inspector.createDirectories(runtime);
        return inspector.inspect(runtime);
    }

    private Path parseRequestedPath(String value) {
        if (value == null || value.isBlank()) {
            throw new InstallationException("Choose a backup destination, or configure backups later.");
        }
        Path raw = Path.of(value.trim());
        if (!raw.isAbsolute()) {
            throw new InstallationException("Backup destination must be an absolute path.");
        }
        return raw.toAbsolutePath().normalize();
    }

    private void validatePathShape(Path path) throws IOException {
        if (path.equals(Path.of("/")) || path.getParent() == null) {
            throw new InstallationException("Choose a dedicated backup folder instead of the filesystem root.");
        }
        if (samePath(path, internalRoot())) {
            return;
        }
        if (isInside(path, runtimeLayout.runtimeRoot())) {
            throw new InstallationException("An external backup destination cannot be inside the Autark-OS runtime or app data.");
        }
        for (Path systemRoot : SYSTEM_ROOTS) {
            if (isInside(path, systemRoot)) {
                throw new InstallationException("Choose a mounted backup drive instead of a system folder.");
            }
        }
        rejectSymlinkSegments(path);
    }

    private void rejectSymlinkSegments(Path path) throws IOException {
        Path current = path.getRoot();
        for (Path component : path) {
            current = current.resolve(component);
            if (Files.exists(current) && Files.isSymbolicLink(current)) {
                throw new InstallationException("Backup destinations cannot use symbolic links.");
            }
        }
    }

    private Path nearestExistingDirectory(Path requested) throws IOException {
        Path current = requested;
        while (current != null && !Files.exists(current)) {
            current = current.getParent();
        }
        if (current == null || !Files.isDirectory(current)) {
            throw new InstallationException("The parent folder for the backup destination does not exist.");
        }
        return current;
    }

    private void probeWrite(Path root) throws IOException {
        Path probe = root.resolve(".autark-os-write-probe-" + UUID.randomUUID()).normalize();
        if (!isInside(probe, root)) {
            throw new InstallationException("Backup probe path escaped the selected destination.");
        }
        try {
            Files.writeString(probe, "Autark-OS backup destination probe\n", StandardCharsets.UTF_8);
            String content = Files.readString(probe, StandardCharsets.UTF_8);
            if (!content.startsWith("Autark-OS backup destination probe")) {
                throw new IOException("The backup drive did not return the validation probe.");
            }
        } finally {
            Files.deleteIfExists(probe);
        }
    }

    private BackupModels.BackupDestination destination(String kind, String status, Path path, Inspection inspection, boolean protectsDriveFailure, String message, String actionLabel) {
        return new BackupModels.BackupDestination(
                kind,
                status,
                path.toAbsolutePath().normalize().toString(),
                inspection.mountPoint(),
                inspection.identity(),
                inspection.filesystemType(),
                true,
                inspection.writable(),
                inspection.usableBytes(),
                protectsDriveFailure,
                message,
                actionLabel,
                Instant.now());
    }

    private BackupModels.BackupDestination unavailable(String kind, Path path, String status, String message, String actionLabel) {
        return new BackupModels.BackupDestination(kind, status, path.toAbsolutePath().normalize().toString(), "", "", "", false, false, 0, false, message, actionLabel, Instant.now());
    }

    private boolean samePath(Path first, Path second) {
        return first.toAbsolutePath().normalize().equals(second.toAbsolutePath().normalize());
    }

    private boolean isInside(Path child, Path parent) {
        return child.toAbsolutePath().normalize().startsWith(parent.toAbsolutePath().normalize());
    }

    private boolean sameIdentity(String first, String second) {
        return first != null && first.equals(second);
    }

    private String concise(Exception exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? "No detailed filesystem error was returned." : message;
    }

    @FunctionalInterface
    interface DestinationConfigurator {
        void configure(BackupModels.BackupDestination destination, List<Path> history) throws IOException;
    }

    interface DestinationInspector {
        void createDirectories(Path path) throws IOException;

        Inspection inspect(Path path) throws IOException;
    }

    record Inspection(String mountPoint, String identity, String filesystemType, boolean writable, long usableBytes) {
    }

    private static final class NioDestinationInspector implements DestinationInspector {
        @Override
        public void createDirectories(Path path) throws IOException {
            Files.createDirectories(path);
        }

        @Override
        public Inspection inspect(Path path) throws IOException {
            FileStore store = Files.getFileStore(path);
            String type = store.type() == null || store.type().isBlank() ? "unknown" : store.type();
            Path mountPoint = mountPoint(path, store);
            String identity = uuidIdentity(store.name());
            if (identity.isBlank()) {
                identity = "filesystem:" + store.name() + ":" + type + ":" + mountPoint;
            }
            return new Inspection(mountPoint.toString(), identity, type, Files.isWritable(path), store.getUsableSpace());
        }

        private Path mountPoint(Path path, FileStore targetStore) throws IOException {
            Path current = path.toAbsolutePath().normalize();
            Path mount = current;
            while (current.getParent() != null) {
                Path parent = current.getParent();
                FileStore parentStore = Files.getFileStore(parent);
                if (!sameStore(targetStore, parentStore)) {
                    break;
                }
                mount = parent;
                current = parent;
            }
            return mount;
        }

        private boolean sameStore(FileStore first, FileStore second) {
            return first.name().equals(second.name()) && first.type().equals(second.type());
        }

        private String uuidIdentity(String deviceName) {
            Path uuidDirectory = Path.of("/dev/disk/by-uuid");
            if (!Files.isDirectory(uuidDirectory) || deviceName == null || deviceName.isBlank()) {
                return "";
            }
            try (var entries = Files.list(uuidDirectory)) {
                Path device = Path.of(deviceName).toRealPath();
                return entries
                        .filter(Files::isSymbolicLink)
                        .filter(entry -> pointsTo(entry, device))
                        .map(entry -> "uuid:" + entry.getFileName())
                        .findFirst()
                        .orElse("");
            } catch (Exception ignored) {
                return "";
            }
        }

        private boolean pointsTo(Path link, Path device) {
            try {
                return link.toRealPath().equals(device);
            } catch (IOException exception) {
                return false;
            }
        }
    }
}

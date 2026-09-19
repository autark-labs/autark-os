package com.autarkos.fileops;

import java.io.IOException;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

import com.autarkos.marketplace.runtime.RuntimeLayout;

@Service
public class AutarkOsFileOpsService {

    private static final Pattern APP_ID_PATTERN = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]*");

    private final RuntimeLayout runtimeLayout;
    private final LocalAutarkOsFileOperations localOperations;

    public AutarkOsFileOpsService(RuntimeLayout runtimeLayout, LocalAutarkOsFileOperations localOperations) {
        this.runtimeLayout = runtimeLayout;
        this.localOperations = localOperations;
    }

    public void clearAppRuntime(String appId) throws IOException {
        localOperations.clearDirectoryContents(appRoot(appId));
    }

    public long createManagedArchive(
            String appId,
            Map<String, Path> protectedPaths,
            Path destination,
            Path approvedBackupRoot) throws IOException {
        requireSafeAppId(appId);
        if (protectedPaths == null || protectedPaths.isEmpty()) {
            throw new IllegalArgumentException("At least one protected app-data path is required.");
        }
        Path root = appRoot(appId);
        Map<String, Path> sources = new LinkedHashMap<>();
        protectedPaths.forEach((relative, source) -> sources.put(
                requireManagedRelativePath(relative),
                requireInsideAppRoot(source, root)));
        return localOperations.createPrefixedArchive(sources, requireBackupPath(destination, approvedBackupRoot));
    }

    public long createManagedFullArchive(
            Map<String, Map<String, Path>> appPaths,
            Path destination,
            Path approvedBackupRoot) throws IOException {
        if (appPaths == null || appPaths.isEmpty()) {
            throw new IllegalArgumentException("At least one app is required for a full archive.");
        }
        Map<String, Path> sources = new LinkedHashMap<>();
        appPaths.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(appEntry -> {
            String appId = appEntry.getKey();
            Map<String, Path> paths = appEntry.getValue();
            requireSafeAppId(appId);
            Path root = appRoot(appId);
            paths.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(pathEntry -> {
                String relative = pathEntry.getKey();
                Path source = pathEntry.getValue();
                String safeRelative = requireManagedRelativePath(relative);
                sources.put(appId + "/" + safeRelative, requireInsideAppRoot(source, root));
            });
        });
        return localOperations.createPrefixedArchive(sources, requireBackupPath(destination, approvedBackupRoot));
    }

    public void restoreAppData(Path archive, String scope, String appId) throws IOException {
        restoreAppData(archive, scope, appId, backupRoot());
    }

    public void restoreAppData(Path archive, String scope, String appId, Path approvedBackupRoot) throws IOException {
        Path backupPath = requireBackupPath(archive, approvedBackupRoot);
        Path appRoot = appRoot(appId);
        String restoreScope = scope == null || scope.isBlank() ? "app" : scope;
        localOperations.restoreAppData(backupPath, restoreScope, appId, appRoot);
    }

    public void deleteBackup(Path backupPath) throws IOException {
        deleteBackup(backupPath, backupRoot());
    }

    public void deleteBackup(Path backupPath, Path approvedBackupRoot) throws IOException {
        Path path = requireBackupPath(backupPath, approvedBackupRoot);
        localOperations.deleteBackup(path);
    }

    private Path appRoot(String appId) {
        requireSafeAppId(appId);
        Path root = runtimeLayout.appRoot(appId).toAbsolutePath().normalize();
        Path appsRoot = appsRoot();
        if (!root.startsWith(appsRoot)) {
            throw new IllegalArgumentException("App runtime path must stay under Autark-OS apps.");
        }
        return root;
    }

    private void requireSafeAppId(String appId) {
        if (appId == null || !APP_ID_PATTERN.matcher(appId).matches()) {
            throw new IllegalArgumentException("Invalid app id for Autark-OS file operation.");
        }
    }

    private String requireManagedRelativePath(String value) {
        if (value == null || !value.matches("[A-Za-z0-9][A-Za-z0-9._/-]*") || value.contains("..") || value.startsWith("/")) {
            throw new IllegalArgumentException("Invalid managed app-data path.");
        }
        return value;
    }

    private Path requireInsideAppRoot(Path value, Path appRoot) {
        Path source = value.toAbsolutePath().normalize();
        if (!source.startsWith(appRoot)) {
            throw new IllegalArgumentException("Protected app data must stay under its managed runtime folder.");
        }
        return source;
    }

    private Path requireBackupPath(Path path, Path approvedBackupRoot) {
        Path normalized = path.toAbsolutePath().normalize();
        Path root = approvedBackupRoot.toAbsolutePath().normalize();
        if (!normalized.startsWith(root)) {
            throw new IllegalArgumentException("File operation paths must stay under the approved Autark-OS backup destination.");
        }
        return normalized;
    }

    private Path appsRoot() {
        return runtimeLayout.runtimeRoot().resolve("apps").toAbsolutePath().normalize();
    }

    private Path backupRoot() {
        return runtimeLayout.runtimeRoot().resolve("backups").toAbsolutePath().normalize();
    }

}

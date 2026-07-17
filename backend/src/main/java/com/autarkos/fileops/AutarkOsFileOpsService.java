package com.autarkos.fileops;

import java.io.IOException;
import java.nio.file.AccessDeniedException;
import java.nio.file.FileSystemException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.backups.BackupModels;
import com.autarkos.system.SystemCommandRunner;

@Service
public class AutarkOsFileOpsService {

    private static final Duration COMMAND_TIMEOUT = Duration.ofMinutes(10);
    private static final String DEFAULT_HELPER_COMMAND = "/opt/autark-os/bin/autark-os-fileops";
    private static final Pattern APP_ID_PATTERN = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]*");

    private final RuntimeLayout runtimeLayout;
    private final AutarkOsFileOperations localOperations;
    private final CommandRunner commandRunner;
    private final String helperCommand;

    @Autowired
    public AutarkOsFileOpsService(RuntimeLayout runtimeLayout, AutarkOsFileOperations localOperations) {
        this(runtimeLayout, localOperations, new ProcessCommandRunner(new SystemCommandRunner()), defaultHelperCommand());
    }

    AutarkOsFileOpsService(RuntimeLayout runtimeLayout, AutarkOsFileOperations localOperations, CommandRunner commandRunner) {
        this(runtimeLayout, localOperations, commandRunner, defaultHelperCommand());
    }

    AutarkOsFileOpsService(RuntimeLayout runtimeLayout, AutarkOsFileOperations localOperations, CommandRunner commandRunner, String helperCommand) {
        this.runtimeLayout = runtimeLayout;
        this.localOperations = localOperations;
        this.commandRunner = commandRunner;
        this.helperCommand = helperCommand == null || helperCommand.isBlank() ? DEFAULT_HELPER_COMMAND : helperCommand;
    }

    public void clearAppRuntime(String appId) throws IOException {
        Path appRoot = appRoot(appId);
        try {
            localOperations.clearDirectoryContents(appRoot);
        } catch (IOException exception) {
            if (!isPermissionFailure(exception)) {
                throw exception;
            }
            runPrivileged("clear-runtime", "--app", appId);
        }
    }

    public long createSafetyArchive(String appId, Path destination) throws IOException {
        return createSafetyArchive(appId, destination, backupRoot());
    }

    public long createSafetyArchive(String appId, Path destination, Path approvedBackupRoot) throws IOException {
        Path appRoot = appRoot(appId);
        Path backupPath = requireBackupPath(destination, approvedBackupRoot);
        try {
            return localOperations.createArchive(appRoot, backupPath);
        } catch (IOException exception) {
            if (!isPermissionFailure(exception)) {
                throw exception;
            }
            runPrivileged("create-safety-archive", approvedBackupRoot, "--app", appId, "--destination", backupPath.toString());
            return Files.isRegularFile(backupPath) ? Files.size(backupPath) : 0;
        }
    }

    public long createFullArchive(List<String> appIds, Path destination) throws IOException {
        return createFullArchive(appIds, destination, backupRoot());
    }

    public long createFullArchive(List<String> appIds, Path destination, Path approvedBackupRoot) throws IOException {
        if (appIds == null || appIds.isEmpty()) {
            throw new IllegalArgumentException("At least one app id is required for a full archive.");
        }
        Path backupPath = requireBackupPath(destination, approvedBackupRoot);
        Map<String, Path> sources = new LinkedHashMap<>();
        for (String appId : appIds) {
            sources.put(appId, appRoot(appId));
        }
        String joinedAppIds = String.join(",", sources.keySet());
        try {
            return localOperations.createPrefixedArchive(sources, backupPath);
        } catch (IOException exception) {
            if (!isPermissionFailure(exception)) {
                throw exception;
            }
            runPrivileged("create-full-archive", approvedBackupRoot, "--apps", joinedAppIds, "--destination", backupPath.toString());
            return Files.isRegularFile(backupPath) ? Files.size(backupPath) : 0;
        }
    }

    public void restoreAppData(Path archive, String scope, String appId) throws IOException {
        restoreAppData(archive, scope, appId, backupRoot());
    }

    public void restoreAppData(Path archive, String scope, String appId, Path approvedBackupRoot) throws IOException {
        Path backupPath = requireBackupPath(archive, approvedBackupRoot);
        Path appRoot = appRoot(appId);
        String restoreScope = scope == null || scope.isBlank() ? "app" : scope;
        try {
            localOperations.restoreAppData(backupPath, restoreScope, appId, appRoot);
        } catch (IOException exception) {
            if (!isPermissionFailure(exception)) {
                throw exception;
            }
            runPrivileged("restore-app-data", approvedBackupRoot, "--app", appId, "--archive", backupPath.toString(), "--scope", restoreScope);
        }
    }

    public void deleteBackup(Path backupPath) throws IOException {
        deleteBackup(backupPath, backupRoot());
    }

    public void deleteBackup(Path backupPath, Path approvedBackupRoot) throws IOException {
        Path path = requireBackupPath(backupPath, approvedBackupRoot);
        try {
            localOperations.deleteBackup(path);
        } catch (IOException exception) {
            if (!isPermissionFailure(exception)) {
                throw exception;
            }
            runPrivileged("delete-backup", approvedBackupRoot, "--path", path.toString());
        }
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

    /** Writes the root-owned allow-list only after the destination has passed the canonical probe. */
    public void configureBackupDestination(BackupModels.BackupDestination destination, List<Path> history) throws IOException {
        Path root = Path.of(destination.configuredPath()).toAbsolutePath().normalize();
        List<String> args = new ArrayList<>();
        args.add("--destination");
        args.add(root.toString());
        args.add("--destination-identity");
        args.add(destination.deviceIdentity());
        args.add("--destination-filesystem");
        args.add(destination.filesystemType());
        args.add("--destination-mount-point");
        args.add(destination.mountPoint());
        for (Path previous : history == null ? List.<Path>of() : history) {
            args.add("--history-root");
            args.add(previous.toAbsolutePath().normalize().toString());
        }
        runPrivileged("configure-backup-destination", root, args.toArray(String[]::new));
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

    private void runPrivileged(String operation, String... args) throws IOException {
        runPrivileged(operation, backupRoot(), args);
    }

    private void runPrivileged(String operation, Path approvedBackupRoot, String... args) throws IOException {
        List<String> command = new ArrayList<>();
        command.add("sudo");
        command.add("-n");
        command.add(helperCommand);
        command.add(operation);
        command.add("--runtime-root");
        command.add(runtimeLayout.runtimeRoot().toString());
        command.add("--backup-root");
        command.add(approvedBackupRoot.toAbsolutePath().normalize().toString());
        command.addAll(List.of(args));
        CommandResult result = commandRunner.run(command.toArray(String[]::new));
        if (!result.successful()) {
            throw new IOException("Autark-OS could not complete privileged file operation " + operation + ". " + conciseOutput(result));
        }
    }

    private static String defaultHelperCommand() {
        String configured = System.getenv("AUTARK_OS_FILEOPS_HELPER");
        return configured == null || configured.isBlank() ? DEFAULT_HELPER_COMMAND : configured;
    }

    private boolean isPermissionFailure(IOException exception) {
        if (exception instanceof AccessDeniedException) {
            return true;
        }
        if (exception instanceof FileSystemException fileSystemException) {
            String reason = fileSystemException.getReason();
            if (reason != null && reason.toLowerCase().contains("permission")) {
                return true;
            }
        }
        String message = exception.getMessage();
        return message != null && message.toLowerCase().contains("permission denied");
    }

    private String conciseOutput(CommandResult result) {
        if (result.missingCommand()) {
            return "Install the autark-os-fileops helper and rerun Autark-OS setup.";
        }
        String firstLine = result.output().isEmpty() ? "" : result.output().get(0);
        String normalized = firstLine.toLowerCase();
        if (normalized.contains("sudo") && normalized.contains("password")) {
            return "The current backend user cannot run the bounded fileops helper without a password. Run Autark-OS through the autarkos service user or rerun install-autark-os-service.sh to repair helper sudo access.";
        }
        return firstLine.isBlank() ? "No details were returned." : firstLine;
    }

    interface CommandRunner {
        CommandResult run(String... command);
    }

    private static class ProcessCommandRunner implements CommandRunner {
        private final SystemCommandRunner systemCommandRunner;

        private ProcessCommandRunner(SystemCommandRunner systemCommandRunner) {
            this.systemCommandRunner = systemCommandRunner;
        }

        @Override
        public CommandResult run(String... command) {
            SystemCommandRunner.CommandExecutionResult result = systemCommandRunner.run(
                    List.of(command),
                    COMMAND_TIMEOUT,
                    "Autark-OS file operation timed out.",
                    "Autark-OS file operation was interrupted.");
            return new CommandResult(result.exitCode(), result.outputLines(), result.missingCommand());
        }
    }

    record CommandResult(int exitCode, List<String> output, boolean missingCommand) {
        boolean successful() {
            return exitCode == 0;
        }
    }
}

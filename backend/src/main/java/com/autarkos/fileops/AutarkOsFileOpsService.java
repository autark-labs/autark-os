package com.autarkos.fileops;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.AccessDeniedException;
import java.nio.file.FileSystemException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.marketplace.runtime.RuntimeLayout;

@Service
public class AutarkOsFileOpsService {

    private static final Duration COMMAND_TIMEOUT = Duration.ofMinutes(10);
    private static final Pattern APP_ID_PATTERN = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]*");

    private final RuntimeLayout runtimeLayout;
    private final AutarkOsFileOperations localOperations;
    private final CommandRunner commandRunner;
    private final String helperCommand;

    @Autowired
    public AutarkOsFileOpsService(RuntimeLayout runtimeLayout, AutarkOsFileOperations localOperations) {
        this(runtimeLayout, localOperations, new ProcessCommandRunner(), defaultHelperCommand());
    }

    AutarkOsFileOpsService(RuntimeLayout runtimeLayout, AutarkOsFileOperations localOperations, CommandRunner commandRunner) {
        this(runtimeLayout, localOperations, commandRunner, defaultHelperCommand());
    }

    AutarkOsFileOpsService(RuntimeLayout runtimeLayout, AutarkOsFileOperations localOperations, CommandRunner commandRunner, String helperCommand) {
        this.runtimeLayout = runtimeLayout;
        this.localOperations = localOperations;
        this.commandRunner = commandRunner;
        this.helperCommand = helperCommand == null || helperCommand.isBlank() ? "autark-os-fileops" : helperCommand;
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
        Path appRoot = appRoot(appId);
        Path backupPath = requireBackupPath(destination);
        try {
            return localOperations.createArchive(appRoot, backupPath);
        } catch (IOException exception) {
            if (!isPermissionFailure(exception)) {
                throw exception;
            }
            runPrivileged("create-safety-archive", "--app", appId, "--destination", backupPath.toString());
            return Files.isRegularFile(backupPath) ? Files.size(backupPath) : 0;
        }
    }

    public long createFullArchive(List<String> appIds, Path destination) throws IOException {
        if (appIds == null || appIds.isEmpty()) {
            throw new IllegalArgumentException("At least one app id is required for a full archive.");
        }
        Path backupPath = requireBackupPath(destination);
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
            runPrivileged("create-full-archive", "--apps", joinedAppIds, "--destination", backupPath.toString());
            return Files.isRegularFile(backupPath) ? Files.size(backupPath) : 0;
        }
    }

    public void restoreAppData(Path archive, String scope, String appId) throws IOException {
        Path backupPath = requireBackupPath(archive);
        Path appRoot = appRoot(appId);
        String restoreScope = scope == null || scope.isBlank() ? "app" : scope;
        try {
            localOperations.restoreAppData(backupPath, restoreScope, appId, appRoot);
        } catch (IOException exception) {
            if (!isPermissionFailure(exception)) {
                throw exception;
            }
            runPrivileged("restore-app-data", "--app", appId, "--archive", backupPath.toString(), "--scope", restoreScope);
        }
    }

    public void deleteBackup(Path backupPath) throws IOException {
        Path path = requireBackupPath(backupPath);
        try {
            localOperations.deleteBackup(path);
        } catch (IOException exception) {
            if (!isPermissionFailure(exception)) {
                throw exception;
            }
            runPrivileged("delete-backup", "--path", path.toString());
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

    private Path requireBackupPath(Path path) {
        Path normalized = path.toAbsolutePath().normalize();
        if (!normalized.startsWith(backupRoot())) {
            throw new IllegalArgumentException("File operation paths must stay under Autark-OS backups.");
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
        List<String> command = new ArrayList<>();
        command.add("sudo");
        command.add("-n");
        command.add(helperCommand);
        command.add(operation);
        command.add("--runtime-root");
        command.add(runtimeLayout.runtimeRoot().toString());
        command.add("--backup-root");
        command.add(backupRoot().toString());
        command.addAll(List.of(args));
        CommandResult result = commandRunner.run(command.toArray(String[]::new));
        if (!result.successful()) {
            throw new IOException("Autark-OS could not complete privileged file operation " + operation + ". " + conciseOutput(result));
        }
    }

    private static String defaultHelperCommand() {
        String configured = System.getenv("AUTARK_OS_FILEOPS_HELPER");
        return configured == null || configured.isBlank() ? "autark-os-fileops" : configured;
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
        return result.output().isEmpty() ? "No details were returned." : result.output().get(0);
    }

    interface CommandRunner {
        CommandResult run(String... command);
    }

    private static class ProcessCommandRunner implements CommandRunner {
        @Override
        public CommandResult run(String... command) {
            ProcessBuilder processBuilder = new ProcessBuilder(command);
            processBuilder.redirectErrorStream(true);
            try {
                Process process = processBuilder.start();
                List<String> output = new ArrayList<>();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        output.add(line);
                    }
                }
                if (!process.waitFor(COMMAND_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS)) {
                    process.destroyForcibly();
                    return new CommandResult(124, output, false);
                }
                return new CommandResult(process.exitValue(), output, false);
            } catch (IOException exception) {
                return new CommandResult(127, List.of(), true);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                return new CommandResult(130, List.of(), false);
            }
        }
    }

    record CommandResult(int exitCode, List<String> output, boolean missingCommand) {
        boolean successful() {
            return exitCode == 0;
        }
    }
}

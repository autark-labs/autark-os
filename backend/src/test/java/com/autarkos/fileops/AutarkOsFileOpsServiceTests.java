package com.autarkos.fileops;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.AccessDeniedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;

class AutarkOsFileOpsServiceTests {

    @TempDir
    Path tempDir;

    @Test
    void clearsManagedAppRuntimeWithLocalOperationsFirst() throws Exception {
        RuntimeLayout layout = layout();
        Path appRoot = layout.appRoot("vaultwarden");
        Files.createDirectories(appRoot.resolve("data"));
        Files.writeString(appRoot.resolve("data/db.sqlite"), "data");
        List<List<String>> commands = new ArrayList<>();
        AutarkOsFileOpsService service = new AutarkOsFileOpsService(
                layout,
                new LocalAutarkOsFileOperations(),
                command -> {
                    commands.add(Arrays.asList(command));
                    return new AutarkOsFileOpsService.CommandResult(1, List.of("unexpected privileged command"), false);
                });

        service.clearAppRuntime("vaultwarden");

        assertThat(appRoot).exists();
        assertThat(appRoot).isEmptyDirectory();
        assertThat(commands).isEmpty();
    }

    @Test
    void fallsBackToPrivilegedHelperWhenLocalRuntimeClearIsDenied() throws Exception {
        RuntimeLayout layout = layout();
        Path appRoot = layout.appRoot("home-assistant");
        Files.createDirectories(appRoot);
        List<List<String>> commands = new ArrayList<>();
        AutarkOsFileOpsService service = new AutarkOsFileOpsService(
                layout,
                new DeniedAutarkOsFileOperations(),
                command -> {
                    commands.add(Arrays.asList(command));
                    return new AutarkOsFileOpsService.CommandResult(0, List.of("cleared"), false);
                });

        service.clearAppRuntime("home-assistant");

        assertThat(commands).singleElement().satisfies(command -> {
            assertThat(command).containsExactly(
                    "sudo",
                    "-n",
                    "/opt/autark-os/bin/autark-os-fileops",
                    "clear-runtime",
                    "--runtime-root",
                    layout.runtimeRoot().toString(),
                    "--backup-root",
                    layout.runtimeRoot().resolve("backups").toString(),
                    "--app",
                    "home-assistant");
        });
    }

    @Test
    void restoreRejectsArchivesOutsideAutarkOsBackups() throws Exception {
        RuntimeLayout layout = layout();
        Path outsideArchive = tempDir.resolve("outside.zip");
        Files.writeString(outsideArchive, "not a zip");
        AutarkOsFileOpsService service = new AutarkOsFileOpsService(
                layout,
                new LocalAutarkOsFileOperations(),
                command -> new AutarkOsFileOpsService.CommandResult(0, List.of(), false));

        assertThatThrownBy(() -> service.restoreAppData(outsideArchive, "full", "home-assistant"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("approved Autark-OS backup destination");
    }

    @Test
    void restoreFallsBackToPrivilegedHelperWhenLocalRestoreIsDenied() throws Exception {
        RuntimeLayout layout = layout();
        Path backupRoot = layout.runtimeRoot().resolve("backups").resolve("full");
        Files.createDirectories(backupRoot);
        Path archive = backupRoot.resolve("restore.zip");
        Files.writeString(archive, "placeholder");
        List<List<String>> commands = new ArrayList<>();
        AutarkOsFileOpsService service = new AutarkOsFileOpsService(
                layout,
                new DeniedAutarkOsFileOperations(),
                command -> {
                    commands.add(Arrays.asList(command));
                    return new AutarkOsFileOpsService.CommandResult(0, List.of("restored"), false);
                });

        service.restoreAppData(archive, "full", "home-assistant");

        assertThat(commands).singleElement().satisfies(command -> {
            assertThat(command).containsExactly(
                    "sudo",
                    "-n",
                    "/opt/autark-os/bin/autark-os-fileops",
                    "restore-app-data",
                    "--runtime-root",
                    layout.runtimeRoot().toString(),
                    "--backup-root",
                    layout.runtimeRoot().resolve("backups").toString(),
                    "--app",
                    "home-assistant",
                    "--archive",
                    archive.toAbsolutePath().normalize().toString(),
                    "--scope",
                    "full");
        });
    }

    @Test
    void fullArchiveFallsBackToPrivilegedHelperWhenLocalArchiveIsDenied() throws Exception {
        RuntimeLayout layout = layout();
        Path backupRoot = layout.runtimeRoot().resolve("backups").resolve("full");
        Files.createDirectories(backupRoot);
        Path archive = backupRoot.resolve("full.zip");
        List<List<String>> commands = new ArrayList<>();
        AutarkOsFileOpsService service = new AutarkOsFileOpsService(
                layout,
                new DeniedAutarkOsFileOperations(),
                command -> {
                    commands.add(Arrays.asList(command));
                    return new AutarkOsFileOpsService.CommandResult(0, List.of("archived"), false);
                });

        service.createFullArchive(List.of("grafana", "home-assistant"), archive);

        assertThat(commands).singleElement().satisfies(command -> {
            assertThat(command).containsExactly(
                    "sudo",
                    "-n",
                    "/opt/autark-os/bin/autark-os-fileops",
                    "create-full-archive",
                    "--runtime-root",
                    layout.runtimeRoot().toString(),
                    "--backup-root",
                    layout.runtimeRoot().resolve("backups").toString(),
                    "--apps",
                    "grafana,home-assistant",
                    "--destination",
                    archive.toAbsolutePath().normalize().toString());
        });
    }

    @Test
    void rejectsUnsafeAppIdsBeforePrivilegedExecution() {
        RuntimeLayout layout = layout();
        List<List<String>> commands = new ArrayList<>();
        AutarkOsFileOpsService service = new AutarkOsFileOpsService(
                layout,
                new DeniedAutarkOsFileOperations(),
                command -> {
                    commands.add(Arrays.asList(command));
                    return new AutarkOsFileOpsService.CommandResult(0, List.of(), false);
                });

        assertThatThrownBy(() -> service.clearAppRuntime("../home"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid app id");
        assertThat(commands).isEmpty();
    }

    @Test
    void privilegedFailureExplainsWhenCurrentUserCannotUsePasswordlessHelper() throws Exception {
        RuntimeLayout layout = layout();
        Path backupRoot = layout.runtimeRoot().resolve("backups").resolve("full");
        Files.createDirectories(backupRoot);
        Path archive = backupRoot.resolve("full.zip");
        AutarkOsFileOpsService service = new AutarkOsFileOpsService(
                layout,
                new DeniedAutarkOsFileOperations(),
                command -> new AutarkOsFileOpsService.CommandResult(1, List.of("sudo: a password is required"), false));

        assertThatThrownBy(() -> service.createFullArchive(List.of("grafana"), archive))
                .isInstanceOf(java.io.IOException.class)
                .hasMessageContaining("current backend user")
                .hasMessageContaining("autarkos service user")
                .hasMessageContaining("install-autark-os-service.sh");
    }

    private RuntimeLayout layout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(tempDir.resolve("runtime").toString());
        return new RuntimeLayout(properties);
    }

    private static class DeniedAutarkOsFileOperations extends LocalAutarkOsFileOperations {
        @Override
        public void clearDirectoryContents(Path directory) throws java.io.IOException {
            throw new AccessDeniedException(directory.toString());
        }

        @Override
        public void restoreAppData(Path archive, String scope, String appId, Path destination) throws java.io.IOException {
            throw new AccessDeniedException(destination.toString());
        }

        @Override
        public long createPrefixedArchive(java.util.Map<String, Path> sources, Path destination) throws java.io.IOException {
            throw new AccessDeniedException(destination.toString());
        }
    }
}

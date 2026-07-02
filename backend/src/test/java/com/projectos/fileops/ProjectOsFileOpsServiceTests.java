package com.projectos.fileops;

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

import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

class ProjectOsFileOpsServiceTests {

    @TempDir
    Path tempDir;

    @Test
    void clearsManagedAppRuntimeWithLocalOperationsFirst() throws Exception {
        RuntimeLayout layout = layout();
        Path appRoot = layout.appRoot("vaultwarden");
        Files.createDirectories(appRoot.resolve("data"));
        Files.writeString(appRoot.resolve("data/db.sqlite"), "data");
        List<List<String>> commands = new ArrayList<>();
        ProjectOsFileOpsService service = new ProjectOsFileOpsService(
                layout,
                new LocalProjectOsFileOperations(),
                command -> {
                    commands.add(Arrays.asList(command));
                    return new ProjectOsFileOpsService.CommandResult(1, List.of("unexpected privileged command"), false);
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
        ProjectOsFileOpsService service = new ProjectOsFileOpsService(
                layout,
                new DeniedProjectOsFileOperations(),
                command -> {
                    commands.add(Arrays.asList(command));
                    return new ProjectOsFileOpsService.CommandResult(0, List.of("cleared"), false);
                });

        service.clearAppRuntime("home-assistant");

        assertThat(commands).singleElement().satisfies(command -> {
            assertThat(command).containsExactly(
                    "sudo",
                    "-n",
                    "project-os-fileops",
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
    void restoreRejectsArchivesOutsideProjectOsBackups() throws Exception {
        RuntimeLayout layout = layout();
        Path outsideArchive = tempDir.resolve("outside.zip");
        Files.writeString(outsideArchive, "not a zip");
        ProjectOsFileOpsService service = new ProjectOsFileOpsService(
                layout,
                new LocalProjectOsFileOperations(),
                command -> new ProjectOsFileOpsService.CommandResult(0, List.of(), false));

        assertThatThrownBy(() -> service.restoreAppData(outsideArchive, "full", "home-assistant"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Project OS backups");
    }

    @Test
    void restoreFallsBackToPrivilegedHelperWhenLocalRestoreIsDenied() throws Exception {
        RuntimeLayout layout = layout();
        Path backupRoot = layout.runtimeRoot().resolve("backups").resolve("full");
        Files.createDirectories(backupRoot);
        Path archive = backupRoot.resolve("restore.zip");
        Files.writeString(archive, "placeholder");
        List<List<String>> commands = new ArrayList<>();
        ProjectOsFileOpsService service = new ProjectOsFileOpsService(
                layout,
                new DeniedProjectOsFileOperations(),
                command -> {
                    commands.add(Arrays.asList(command));
                    return new ProjectOsFileOpsService.CommandResult(0, List.of("restored"), false);
                });

        service.restoreAppData(archive, "full", "home-assistant");

        assertThat(commands).singleElement().satisfies(command -> {
            assertThat(command).containsExactly(
                    "sudo",
                    "-n",
                    "project-os-fileops",
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
        ProjectOsFileOpsService service = new ProjectOsFileOpsService(
                layout,
                new DeniedProjectOsFileOperations(),
                command -> {
                    commands.add(Arrays.asList(command));
                    return new ProjectOsFileOpsService.CommandResult(0, List.of("archived"), false);
                });

        service.createFullArchive(List.of("grafana", "home-assistant"), archive);

        assertThat(commands).singleElement().satisfies(command -> {
            assertThat(command).containsExactly(
                    "sudo",
                    "-n",
                    "project-os-fileops",
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
        ProjectOsFileOpsService service = new ProjectOsFileOpsService(
                layout,
                new DeniedProjectOsFileOperations(),
                command -> {
                    commands.add(Arrays.asList(command));
                    return new ProjectOsFileOpsService.CommandResult(0, List.of(), false);
                });

        assertThatThrownBy(() -> service.clearAppRuntime("../home"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid app id");
        assertThat(commands).isEmpty();
    }

    private RuntimeLayout layout() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(tempDir.resolve("runtime").toString());
        return new RuntimeLayout(properties);
    }

    private static class DeniedProjectOsFileOperations extends LocalProjectOsFileOperations {
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

package com.autarkos.marketplace.install;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.system.SystemCommandRunner;

class ProcessDockerComposeExecutorTests {

    private static final String CONTAINER_ID = "62ed87274ad3d658ca4775737021a2ec5b4bb5f484f16876ce6f21598e00e454";

    @TempDir
    Path runtimeRoot;

    @Test
    void missingComposeCleanupExportsAndVerifiesBeforeContainerRemoval() {
        RecordingCommandRunner runner = new RecordingCommandRunner(false);
        ProcessDockerComposeExecutor executor = new ProcessDockerComposeExecutor(runner);

        RuntimeModels.DockerComposeResult result = executor.archiveAndRemoveManagedProject(
                "autarkos_raspberrypi_vaultwarden",
                "vaultwarden",
                runtimeRoot.resolve("recovery"));

        assertThat(result.successful()).isTrue();
        assertThat(result.output()).anySatisfy(line -> assertThat(line).contains("container writable-filesystem recovery archive"));
        assertThat(runner.commands).hasSize(3);
        assertThat(runner.commands.get(0)).contains(
                "label=com.docker.compose.project=autarkos_raspberrypi_vaultwarden",
                "label=autark-os.app-id=vaultwarden");
        assertThat(runner.commands.get(1)).startsWith("docker", "export", "--output");
        assertThat(runner.commands.get(2)).containsExactly("docker", "rm", "-f", CONTAINER_ID);
    }

    @Test
    void failedContainerExportNeverRunsDockerRemove() {
        RecordingCommandRunner runner = new RecordingCommandRunner(true);
        ProcessDockerComposeExecutor executor = new ProcessDockerComposeExecutor(runner);

        RuntimeModels.DockerComposeResult result = executor.archiveAndRemoveManagedProject(
                "autarkos_raspberrypi_vaultwarden",
                "vaultwarden",
                runtimeRoot.resolve("recovery"));

        assertThat(result.successful()).isFalse();
        assertThat(result.output()).anySatisfy(line -> assertThat(line).contains("removal was cancelled"));
        assertThat(runner.commands).hasSize(2);
        assertThat(runner.commands).noneSatisfy(command -> assertThat(command).contains("rm"));
    }

    @Test
    void missingComposeStatusAndStopUseBothOwnershipLabels() {
        RecordingCommandRunner runner = new RecordingCommandRunner(false);
        ProcessDockerComposeExecutor executor = new ProcessDockerComposeExecutor(runner);
        Path missingCompose = runtimeRoot.resolve("apps/vaultwarden/compose.yaml");

        List<RuntimeModels.DockerContainerStatus> containers = executor.containersForApp(
                missingCompose,
                "autarkos_raspberrypi_vaultwarden",
                "vaultwarden");
        RuntimeModels.DockerComposeResult stopped = executor.stopManagedProject(
                missingCompose,
                "autarkos_raspberrypi_vaultwarden",
                "vaultwarden");

        assertThat(containers).singleElement().satisfies(container -> {
            assertThat(container.name()).isEqualTo("autarkos_raspberrypi_vaultwarden");
            assertThat(container.state()).isEqualTo("exited");
        });
        assertThat(stopped.successful()).isTrue();
        assertThat(runner.commands).allSatisfy(command -> {
            if (command.contains("ps")) {
                assertThat(command).contains("label=autark-os.app-id=vaultwarden");
            }
        });
    }

    private static final class RecordingCommandRunner extends SystemCommandRunner {
        private final boolean failExport;
        private final List<List<String>> commands = new ArrayList<>();

        private RecordingCommandRunner(boolean failExport) {
            this.failExport = failExport;
        }

        @Override
        public CommandExecutionResult run(List<String> command) {
            commands.add(List.copyOf(command));
            if (command.contains("ps") && command.contains("{{.ID}}")) {
                return new CommandExecutionResult(0, List.of(CONTAINER_ID), false);
            }
            if (command.contains("ps")) {
                return new CommandExecutionResult(0, List.of("autarkos_raspberrypi_vaultwarden\texited\tExited (0) 45 hours ago\t\tvaultwarden"), false);
            }
            if (command.contains("export")) {
                if (failExport) {
                    return new CommandExecutionResult(1, List.of("export failed"), false);
                }
                Path output = Path.of(command.get(command.indexOf("--output") + 1));
                try {
                    Files.writeString(output, "archived container filesystem");
                } catch (IOException exception) {
                    return new CommandExecutionResult(1, List.of(exception.getMessage()), false);
                }
                return new CommandExecutionResult(0, List.of(), false);
            }
            return new CommandExecutionResult(0, List.of("ok"), false);
        }
    }
}

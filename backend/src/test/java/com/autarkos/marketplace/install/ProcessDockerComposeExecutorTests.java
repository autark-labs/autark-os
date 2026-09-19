package com.autarkos.marketplace.install;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.util.List;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.system.SystemCommandRunner;

class ProcessDockerComposeExecutorTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void dockerCommandsUseExplicitDeadlinesInsteadOfAnUnboundedRunner() {
        RecordingCommandRunner runner = new RecordingCommandRunner();
        ProcessDockerComposeExecutor executor = new ProcessDockerComposeExecutor(runner);
        Path compose = runtimeRoot.resolve("compose.yaml");

        executor.pull(compose, "autarkos_homepage");
        executor.up(compose, "autarkos_homepage");
        assertThat(runner.timeouts).contains(SystemCommandRunner.IMAGE_PULL_TIMEOUT, SystemCommandRunner.COMPOSE_TIMEOUT);
        assertThat(runner.timeouts).doesNotContain(Duration.ZERO);
    }

    private static final class RecordingCommandRunner extends SystemCommandRunner {
        private final List<Duration> timeouts = new java.util.ArrayList<>();

        @Override
        public CommandExecutionResult run(List<String> command) {
            return run(command, SystemCommandRunner.PROBE_TIMEOUT, "", "");
        }

        @Override
        public CommandExecutionResult run(List<String> command, java.time.Duration timeout, String timeoutMessage, String interruptedMessage) {
            timeouts.add(timeout);
            if (command.contains("ps")) {
                return new CommandExecutionResult(0, List.of("autarkos_raspberrypi_vaultwarden\texited\tExited (0) 45 hours ago\t\tvaultwarden"), false);
            }
            return new CommandExecutionResult(0, List.of("ok"), false);
        }
    }
}

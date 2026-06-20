package com.projectos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;

class SystemCommandRunnerTests {

    private final SystemCommandRunner runner = new SystemCommandRunner();

    @Test
    void capturesExitCodeAndCombinedOutput() {
        SystemCommandRunner.CommandExecutionResult result = runner.run(List.of("sh", "-c", "printf hello"));

        assertThat(result.exitCode()).isZero();
        assertThat(result.output()).isEqualTo("hello");
        assertThat(result.successful()).isTrue();
    }

    @Test
    void returnsTimeoutResultWhenCommandExceedsLimit() {
        SystemCommandRunner.CommandExecutionResult result = runner.run(
                List.of("sh", "-c", "sleep 2"),
                Duration.ofMillis(100),
                "Timed out.",
                "Interrupted.");

        assertThat(result.exitCode()).isEqualTo(124);
        assertThat(result.output()).isEqualTo("Timed out.");
    }
}

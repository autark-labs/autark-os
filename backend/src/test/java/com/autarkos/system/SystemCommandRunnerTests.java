package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

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
    void preservesNonzeroExitCodeAndDiagnosticOutput() {
        SystemCommandRunner.CommandExecutionResult result = runner.run(
                List.of("sh", "-c", "printf 'failure detail' >&2; exit 17"),
                Duration.ofSeconds(1),
                "Timed out.",
                "Interrupted.");

        assertThat(result.exitCode()).isEqualTo(17);
        assertThat(result.successful()).isFalse();
        assertThat(result.output()).isEqualTo("failure detail");
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

    @Test
    void suppliesOnlyTheExplicitEnvironmentWithoutShellExpansion() {
        SystemCommandRunner.CommandExecutionResult result = runner.run(
                List.of(
                        "/bin/sh",
                        "-c",
                        "printf '%s|%s' \"$PRO115_TEST\" \"${HOME-unset}\""),
                Map.of("PRO115_TEST", "literal-$()-value"));

        assertThat(result.exitCode()).isZero();
        assertThat(result.output()).isEqualTo("literal-$()-value|unset");
    }

    @Test
    void drainsLargeCombinedOutputWhileTheChildIsRunningAndRetainsOnlyATail() {
        SystemCommandRunner.CommandExecutionResult result = runner.run(
                List.of("sh", "-c", "i=1; while [ $i -le 5000 ]; do printf 'line-%04d-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\\n' $i; i=$((i+1)); done; printf 'tail-ok\\n' >&2"),
                Duration.ofSeconds(5),
                "Timed out.",
                "Interrupted.");

        assertThat(result.successful()).isTrue();
        assertThat(result.output()).contains("tail-ok", "Earlier command output was discarded");
        assertThat(result.output().length()).isLessThan(70_000);
    }

    @Test
    void quietAndNoisyHangsReturnTimeoutWithoutLeavingTheParentAlive() {
        SystemCommandRunner.CommandExecutionResult quiet = runner.run(
                List.of("sh", "-c", "sleep 30"), Duration.ofMillis(100), "Quiet timeout.", "Interrupted.");
        SystemCommandRunner.CommandExecutionResult noisy = runner.run(
                List.of("sh", "-c", "while :; do printf xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\\n; done"),
                Duration.ofMillis(100), "Noisy timeout.", "Interrupted.");

        assertThat(quiet.exitCode()).isEqualTo(124);
        assertThat(quiet.timedOut()).isTrue();
        assertThat(quiet.output()).contains("Quiet timeout.");
        assertThat(noisy.exitCode()).isEqualTo(124);
        assertThat(noisy.timedOut()).isTrue();
        assertThat(noisy.output()).contains("Noisy timeout.");
        assertThat(noisy.output().length()).isLessThan(70_000);
    }

    @Test
    void timeoutTerminatesKnownChildProcessBeforeReturning() throws Exception {
        java.nio.file.Path childPid = java.nio.file.Files.createTempFile("autark-os-command-child", ".pid");
        try {
            SystemCommandRunner.CommandExecutionResult result = runner.run(
                    List.of("sh", "-c", "sleep 30 & echo $! > '" + childPid + "'; wait"),
                    Duration.ofMillis(150), "Timed out.", "Interrupted.");

            long pid = Long.parseLong(java.nio.file.Files.readString(childPid).trim());
            assertThat(result.timedOut()).isTrue();
            assertThat(ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false)).isFalse();
        } finally {
            java.nio.file.Files.deleteIfExists(childPid);
        }
    }

    @Test
    void interruptionTerminatesTheChildAndPreservesTheCallerInterrupt() throws Exception {
        java.nio.file.Path childPid = java.nio.file.Files.createTempFile("autark-os-command-interrupt", ".pid");
        AtomicReference<SystemCommandRunner.CommandExecutionResult> result = new AtomicReference<>();
        AtomicReference<Boolean> interrupted = new AtomicReference<>(false);
        Thread thread = Thread.ofPlatform().start(() -> {
            result.set(runner.run(List.of("sh", "-c", "sleep 30 & echo $! > '" + childPid + "'; wait"), Duration.ofSeconds(30), "Timed out.", "Interrupted."));
            interrupted.set(Thread.currentThread().isInterrupted());
        });
        try {
            waitForFile(childPid);
            thread.interrupt();
            thread.join(Duration.ofSeconds(5).toMillis());
            long pid = Long.parseLong(java.nio.file.Files.readString(childPid).trim());
            assertThat(thread.isAlive()).isFalse();
            assertThat(result.get().exitCode()).isEqualTo(130);
            assertThat(interrupted.get()).isTrue();
            assertThat(ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false)).isFalse();
        } finally {
            java.nio.file.Files.deleteIfExists(childPid);
        }
    }

    private static void waitForFile(java.nio.file.Path file) throws Exception {
        for (int attempt = 0; attempt < 100 && java.nio.file.Files.size(file) == 0; attempt++) {
            Thread.sleep(10);
        }
        assertThat(java.nio.file.Files.size(file)).isGreaterThan(0);
    }
}

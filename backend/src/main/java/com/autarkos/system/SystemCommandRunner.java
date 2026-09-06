package com.autarkos.system;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import org.springframework.stereotype.Component;

@Component
public class SystemCommandRunner {

    public static final Duration PROBE_TIMEOUT = Duration.ofSeconds(30);
    public static final Duration COMPOSE_TIMEOUT = Duration.ofMinutes(5);
    public static final Duration IMAGE_PULL_TIMEOUT = Duration.ofMinutes(20);
    public static final Duration ARCHIVE_TIMEOUT = Duration.ofMinutes(10);
    private static final Duration TERMINATION_GRACE = Duration.ofSeconds(2);
    private static final Duration DRAIN_GRACE = Duration.ofSeconds(2);
    private static final int MAX_OUTPUT_CHARACTERS = 64 * 1024;
    private static final int MAX_LINE_CHARACTERS = 4 * 1024;

    public CommandExecutionResult run(List<String> command) {
        return run(command, PROBE_TIMEOUT, "Command timed out.", "Command was interrupted.");
    }

    public CommandExecutionResult run(
            List<String> command,
            Map<String, String> environment) {
        return run(command, Map.copyOf(environment), PROBE_TIMEOUT, "Command timed out.", "Command was interrupted.");
    }

    public CommandExecutionResult run(String... command) {
        return run(List.of(command));
    }

    public CommandExecutionResult run(List<String> command, Duration timeout, String timeoutMessage, String interruptedMessage) {
        return run(
                command,
                null,
                timeout,
                timeoutMessage,
                interruptedMessage);
    }

    public CommandExecutionResult run(
            List<String> command,
            Map<String, String> environment,
            Duration timeout,
            String timeoutMessage,
            String interruptedMessage) {
        Process process = null;
        OutputTail output = new OutputTail();
        Thread drainer = null;
        try {
            process = process(command, environment).start();
            Process runningProcess = process;
            drainer = Thread.ofVirtual().name("autark-os-command-output").start(() -> drain(runningProcess.getInputStream(), output));
            if (!process.waitFor(requireTimeout(timeout).toMillis(), TimeUnit.MILLISECONDS)) {
                boolean interrupted = terminateAndReap(process, drainer);
                output.addDiagnostic(timeoutMessage);
                if (interrupted) {
                    Thread.currentThread().interrupt();
                }
                return new CommandExecutionResult(124, output.lines(), false, true);
            }
            if (awaitDrain(drainer)) {
                terminateAndReap(process, drainer);
                Thread.currentThread().interrupt();
                output.addDiagnostic(interruptedMessage);
                return new CommandExecutionResult(130, output.lines(), false, false);
            }
            return new CommandExecutionResult(process.exitValue(), output.lines(), false, false);
        } catch (IOException exception) {
            return new CommandExecutionResult(127, List.of(safeMessage(exception)), true, false);
        } catch (InterruptedException exception) {
            terminateAndReap(process, drainer);
            Thread.currentThread().interrupt();
            output.addDiagnostic(interruptedMessage);
            return new CommandExecutionResult(130, output.lines(), false, false);
        }
    }

    public CommandExecutionResult run(Duration timeout, String timeoutMessage, String interruptedMessage, String... command) {
        return run(List.of(command), timeout, timeoutMessage, interruptedMessage);
    }

    private ProcessBuilder process(
            List<String> command,
            Map<String, String> environment) {
        ProcessBuilder processBuilder = new ProcessBuilder(command);
        if (environment != null) {
            processBuilder.environment().clear();
            processBuilder.environment().putAll(environment);
        }
        processBuilder.redirectErrorStream(true);
        return processBuilder;
    }

    private static Duration requireTimeout(Duration timeout) {
        if (timeout == null || timeout.isZero() || timeout.isNegative()) {
            throw new IllegalArgumentException("Command timeout must be positive.");
        }
        return timeout;
    }

    private static void drain(InputStream stream, OutputTail output) {
        try (InputStream input = stream) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                output.append(new String(buffer, 0, read, StandardCharsets.UTF_8));
            }
        } catch (IOException exception) {
            output.addDiagnostic("Could not read command output: " + safeMessage(exception));
        } finally {
            output.finish();
        }
    }

    private static boolean awaitDrain(Thread drainer) {
        try {
            drainer.join();
            return false;
        } catch (InterruptedException exception) {
            return true;
        }
    }

    private static boolean terminateAndReap(Process process, Thread drainer) {
        boolean interrupted = false;
        if (process != null) {
            List<ProcessHandle> descendants = process.toHandle().descendants()
                    .sorted(Comparator.comparingLong(ProcessHandle::pid).reversed())
                    .toList();
            descendants.forEach(handle -> destroy(handle, false));
            destroy(process.toHandle(), false);
            try {
                process.waitFor(TERMINATION_GRACE.toMillis(), TimeUnit.MILLISECONDS);
            } catch (InterruptedException exception) {
                interrupted = true;
            }
            if (process.isAlive()) {
                descendants.forEach(handle -> destroy(handle, true));
                destroy(process.toHandle(), true);
                try {
                    process.waitFor(TERMINATION_GRACE.toMillis(), TimeUnit.MILLISECONDS);
                } catch (InterruptedException exception) {
                    interrupted = true;
                }
            }
            try {
                process.getInputStream().close();
                process.getErrorStream().close();
                process.getOutputStream().close();
            } catch (IOException ignored) {
                // The process may have already closed these streams.
            }
        }
        if (drainer != null && !interrupted) {
            try {
                drainer.join(DRAIN_GRACE.toMillis());
            } catch (InterruptedException exception) {
                interrupted = true;
            }
        }
        return interrupted;
    }

    private static void destroy(ProcessHandle handle, boolean forcibly) {
        if (!handle.isAlive()) {
            return;
        }
        if (forcibly) {
            handle.destroyForcibly();
        } else {
            handle.destroy();
        }
    }

    private static String safeMessage(Exception exception) {
        return exception.getMessage() == null || exception.getMessage().isBlank()
                ? exception.getClass().getSimpleName()
                : exception.getMessage();
    }

    private static final class OutputTail {
        private final ArrayDeque<String> lines = new ArrayDeque<>();
        private final StringBuilder currentLine = new StringBuilder();
        private int retainedCharacters;
        private boolean discarded;
        private boolean currentLineTruncated;

        synchronized void append(String chunk) {
            for (int index = 0; index < chunk.length(); index++) {
                char character = chunk.charAt(index);
                if (character == '\n') {
                    finishLine();
                } else if (currentLine.length() < MAX_LINE_CHARACTERS) {
                    currentLine.append(character);
                } else {
                    currentLineTruncated = true;
                }
            }
        }

        synchronized void addDiagnostic(String message) {
            finishLine();
            add(message == null || message.isBlank() ? "Command failed without diagnostic output." : message);
        }

        synchronized void finish() {
            finishLine();
        }

        synchronized List<String> lines() {
            finishLine();
            List<String> result = new ArrayList<>(lines.size() + (discarded ? 1 : 0));
            if (discarded) {
                result.add("Earlier command output was discarded; the diagnostic tail is shown.");
            }
            result.addAll(lines);
            return List.copyOf(result);
        }

        private void finishLine() {
            if (currentLine.isEmpty() && !currentLineTruncated) {
                return;
            }
            String value = currentLine.toString();
            if (currentLineTruncated) {
                value += " [line truncated]";
            }
            currentLine.setLength(0);
            currentLineTruncated = false;
            add(value);
        }

        private void add(String line) {
            lines.addLast(line);
            retainedCharacters += line.length();
            while (retainedCharacters > MAX_OUTPUT_CHARACTERS && !lines.isEmpty()) {
                retainedCharacters -= lines.removeFirst().length();
                discarded = true;
            }
        }
    }

    public record CommandExecutionResult(int exitCode, List<String> outputLines, boolean missingCommand, boolean timedOut) {
        public CommandExecutionResult(int exitCode, List<String> outputLines, boolean missingCommand) {
            this(exitCode, outputLines, missingCommand, false);
        }

        public CommandExecutionResult(int exitCode, String output) {
            this(exitCode, output == null || output.isEmpty() ? List.of() : List.of(output), false, false);
        }

        public String output() {
            return String.join("\n", outputLines);
        }

        public boolean successful() {
            return exitCode == 0 && !timedOut;
        }
    }
}

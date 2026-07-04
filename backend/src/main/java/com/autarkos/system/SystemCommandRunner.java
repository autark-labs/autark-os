package com.autarkos.system;

import java.io.IOException;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Component;

@Component
public class SystemCommandRunner {

    public CommandExecutionResult run(List<String> command) {
        ProcessBuilder processBuilder = process(command);
        try {
            Process process = processBuilder.start();
            int exitCode = process.waitFor();
            List<String> output = readOutput(process);
            return new CommandExecutionResult(exitCode, output, false);
        } catch (IOException exception) {
            return new CommandExecutionResult(127, List.of(exception.getMessage()), true);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return new CommandExecutionResult(130, List.of("Interrupted"), false);
        }
    }

    public CommandExecutionResult run(String... command) {
        return run(List.of(command));
    }

    public CommandExecutionResult run(List<String> command, Duration timeout, String timeoutMessage, String interruptedMessage) {
        ProcessBuilder processBuilder = process(command);
        try {
            Process process = processBuilder.start();
            if (!process.waitFor(timeout.toMillis(), java.util.concurrent.TimeUnit.MILLISECONDS)) {
                process.destroyForcibly();
                return new CommandExecutionResult(124, List.of(timeoutMessage), false);
            }
            List<String> output = readOutput(process);
            return new CommandExecutionResult(process.exitValue(), output, false);
        } catch (IOException exception) {
            return new CommandExecutionResult(127, List.of(exception.getMessage()), true);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return new CommandExecutionResult(130, List.of(interruptedMessage), false);
        }
    }

    public CommandExecutionResult run(Duration timeout, String timeoutMessage, String interruptedMessage, String... command) {
        return run(List.of(command), timeout, timeoutMessage, interruptedMessage);
    }

    private ProcessBuilder process(List<String> command) {
        ProcessBuilder processBuilder = new ProcessBuilder(command);
        processBuilder.redirectErrorStream(true);
        return processBuilder;
    }

    private List<String> readOutput(Process process) throws IOException {
        List<String> output = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                output.add(line);
            }
        }
        return output;
    }

    public record CommandExecutionResult(int exitCode, List<String> outputLines, boolean missingCommand) {
        public CommandExecutionResult(int exitCode, String output) {
            this(exitCode, output == null || output.isEmpty() ? List.of() : List.of(output), false);
        }

        public String output() {
            return String.join("\n", outputLines);
        }

        public boolean successful() {
            return exitCode == 0;
        }
    }
}

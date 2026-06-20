package com.projectos.system;

import java.io.IOException;
import java.time.Duration;
import java.util.List;

import org.springframework.stereotype.Component;

@Component
public class SystemCommandRunner {

    public CommandExecutionResult run(List<String> command) {
        ProcessBuilder processBuilder = process(command);
        try {
            Process process = processBuilder.start();
            int exitCode = process.waitFor();
            return new CommandExecutionResult(exitCode, new String(process.getInputStream().readAllBytes()));
        } catch (IOException exception) {
            return new CommandExecutionResult(127, exception.getMessage());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return new CommandExecutionResult(130, "Interrupted");
        }
    }

    public CommandExecutionResult run(List<String> command, Duration timeout, String timeoutMessage, String interruptedMessage) {
        ProcessBuilder processBuilder = process(command);
        try {
            Process process = processBuilder.start();
            if (!process.waitFor(timeout.toMillis(), java.util.concurrent.TimeUnit.MILLISECONDS)) {
                process.destroyForcibly();
                return new CommandExecutionResult(124, timeoutMessage);
            }
            return new CommandExecutionResult(process.exitValue(), new String(process.getInputStream().readAllBytes()));
        } catch (IOException exception) {
            return new CommandExecutionResult(127, exception.getMessage());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return new CommandExecutionResult(130, interruptedMessage);
        }
    }

    private ProcessBuilder process(List<String> command) {
        ProcessBuilder processBuilder = new ProcessBuilder(command);
        processBuilder.redirectErrorStream(true);
        return processBuilder;
    }

    public record CommandExecutionResult(int exitCode, String output) {
        boolean successful() {
            return exitCode == 0;
        }
    }
}

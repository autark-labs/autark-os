package com.autarkos.marketplace.install;

import java.nio.file.Path;
import java.util.List;

import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.model.HealthManifest;

/** Waits for Docker startup states and turns them into the install job contract. */
final class InstallStartupChecker {

    private final DockerComposeExecutor dockerComposeExecutor;

    InstallStartupChecker(DockerComposeExecutor dockerComposeExecutor) {
        this.dockerComposeExecutor = dockerComposeExecutor;
    }

    StartupCheck waitForStartup(Path composeFile, String composeProject, HealthManifest health) {
        List<String> lastStatus = List.of();
        List<RuntimeModels.DockerContainerStatus> lastContainers = List.of();
        for (int attempt = 1; attempt <= 20; attempt++) {
            List<RuntimeModels.DockerContainerStatus> containers = dockerComposeExecutor.containers(composeFile, composeProject);
            lastContainers = containers;
            StartupCheck check = evaluateStartup(containers, health);
            lastStatus = check.logs();
            if (check.ready() || check.failed()) return check;
            sleep();
        }
        if (lastContainers.stream().anyMatch(this::running) && lastContainers.stream().noneMatch(this::failed)) {
            return StartupCheck.warmingUp(
                    "The service is running and still finishing startup checks. Autark-OS will keep watching it from Applications.",
                    lastStatus);
        }
        return StartupCheck.failed(
                "The app did not report ready within 20 seconds. Last container state: " + String.join("; ", lastStatus),
                lastStatus);
    }

    private StartupCheck evaluateStartup(List<RuntimeModels.DockerContainerStatus> containers, HealthManifest health) {
        if (containers.isEmpty()) {
            return StartupCheck.pending("Waiting for Docker to report the app container.", List.of("No containers reported yet."));
        }
        List<String> statusLines = containers.stream().map(this::statusLine).toList();
        List<String> failedContainers = containers.stream().filter(this::failed).map(this::statusLine).toList();
        if (!failedContainers.isEmpty()) {
            return StartupCheck.failed("The app container stopped or reported unhealthy: " + String.join("; ", failedContainers), statusLines);
        }
        boolean starting = containers.stream().anyMatch(this::starting);
        boolean running = containers.stream().anyMatch(this::running);
        if (running && !starting) return StartupCheck.ready(readinessDetail(health), statusLines);
        return StartupCheck.pending(health.startingLabel(), statusLines);
    }

    private String readinessDetail(HealthManifest health) {
        if (health == null) return "The app container is running.";
        if (List.of("container", "no-web-ui", "none").contains(health.type())) return health.description();
        if ("tcp".equals(health.type())) {
            return "The service container is running. Autark-OS will keep checking the service port from Applications.";
        }
        return "The app container is running. Autark-OS will keep checking the app link from Applications.";
    }

    private boolean running(RuntimeModels.DockerContainerStatus container) {
        return lower(container.state()).equals("running") || lower(container.status()).startsWith("up ");
    }

    private boolean starting(RuntimeModels.DockerContainerStatus container) {
        return lower(container.state()).equals("created")
                || lower(container.state()).equals("restarting")
                || lower(container.health()).equals("starting")
                || lower(container.status()).contains("starting");
    }

    private boolean failed(RuntimeModels.DockerContainerStatus container) {
        return lower(container.state()).equals("exited")
                || lower(container.state()).equals("dead")
                || lower(container.health()).equals("unhealthy")
                || lower(container.status()).contains("exited")
                || lower(container.status()).contains("unhealthy");
    }

    private String statusLine(RuntimeModels.DockerContainerStatus container) {
        return "%s state=%s health=%s status=%s".formatted(
                container.name(), container.state(), container.health(), container.status());
    }

    private String lower(String value) {
        return value == null ? "" : value.toLowerCase();
    }

    private void sleep() {
        try {
            Thread.sleep(1000);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new InstallationException("Interrupted while waiting for the app to start.", exception);
        }
    }

    record StartupCheck(boolean ready, boolean failed, boolean warmingUp, String detail, List<String> logs) {
        private static StartupCheck ready(String detail, List<String> logs) {
            return new StartupCheck(true, false, false, detail, logs);
        }

        private static StartupCheck warmingUp(String detail, List<String> logs) {
            return new StartupCheck(true, false, true, detail, logs);
        }

        private static StartupCheck pending(String detail, List<String> logs) {
            return new StartupCheck(false, false, false, detail, logs);
        }

        private static StartupCheck failed(String detail, List<String> logs) {
            return new StartupCheck(false, true, false, detail, logs);
        }
    }
}

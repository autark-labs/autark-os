package com.autarkos.marketplace.install;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.marketplace.model.ApplicationManifest;

/** Install and ongoing monitoring share Docker status and local-access checks. */
public final class InstallStartupChecker {

    private final DockerComposeExecutor dockerComposeExecutor;
    private final AppAccessChecker accessChecker;
    private final AppRuntimeStatusResolver runtimeStatusResolver = new AppRuntimeStatusResolver();

    public InstallStartupChecker(DockerComposeExecutor dockerComposeExecutor, AppAccessChecker accessChecker) {
        this.dockerComposeExecutor = dockerComposeExecutor;
        this.accessChecker = accessChecker;
    }

    public StartupCheck waitForStartup(Path composeFile, String composeProject, ApplicationManifest manifest, String accessUrl) {
        var health = manifest.health();
        long deadline = System.nanoTime() + Duration.ofSeconds(health.startupGraceSeconds()).toNanos();
        while (true) {
            var containers = dockerComposeExecutor.containers(composeFile, composeProject);
            var runtime = runtimeStatusResolver.normalize(containers, manifest);
            List<String> logs = List.of(runtime.technicalStatus());
            if (!containers.isEmpty() && (AutarkOsStates.AppStatus.STOPPED.equals(runtime.friendlyStatus())
                    || AutarkOsStates.AppStatus.NEEDS_ATTENTION.equals(runtime.friendlyStatus()))) {
                return new StartupCheck(false, "The app could not start: " + runtime.technicalStatus(), logs);
            }
            boolean running = AutarkOsStates.AppStatus.READY.equals(runtime.friendlyStatus());
            boolean checkAccess = accessChecker.shouldCheckLocalAccess(manifest, accessUrl);
            if (running && (!checkAccess || "reachable".equals(accessChecker.localHealthCheck(manifest.id(), manifest, accessUrl).status()))) {
                return new StartupCheck(true, checkAccess
                        ? "Docker is running and the local app link is responding."
                        : health.description(), logs);
            }
            if (System.nanoTime() >= deadline) {
                String detail = running && checkAccess ? health.failureLabel() + ": the local app link did not respond."
                        : "The app did not finish starting. " + runtime.technicalStatus();
                return new StartupCheck(false, detail + " Startup checks timed out after " + health.startupGraceSeconds() + " seconds.", logs);
            }
            try {
                Thread.sleep(1000);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new InstallationException("Interrupted while waiting for the app to start.", exception);
            }
        }
    }

    public record StartupCheck(boolean ready, String detail, List<String> logs) { }
}

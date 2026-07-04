package com.autarkos.marketplace.install;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.autarkos.activity.ActivityLogService;

class AppContainerLifecycleService {

    private static final Pattern HOST_PORT_CONFLICT = Pattern.compile("host port [^:]*:(\\d+)/tcp: address already in use", Pattern.CASE_INSENSITIVE);

    private final InstalledAppRepository repository;
    private final DockerComposeExecutor composeExecutor;
    private final ActivityLogService activityLogService;
    private final Function<InstalledApp, AppRuntimeView> viewRefresher;

    AppContainerLifecycleService(
            InstalledAppRepository repository,
            DockerComposeExecutor composeExecutor,
            ActivityLogService activityLogService,
            Function<InstalledApp, AppRuntimeView> viewRefresher) {
        this.repository = repository;
        this.composeExecutor = composeExecutor;
        this.activityLogService = activityLogService;
        this.viewRefresher = viewRefresher;
    }

    AppActionResult start(InstalledApp app, Path composeFile) {
        RuntimeModels.DockerComposeResult result = composeExecutor.up(composeFile, app.composeProject());
        return completeAction(app, "start", result, "Starting " + app.appName(), "Could not start " + app.appName());
    }

    AppActionResult stop(InstalledApp app, Path composeFile) {
        RuntimeModels.DockerComposeResult result = composeExecutor.stop(composeFile, app.composeProject());
        return completeAction(app, "stop", result, "Stopped " + app.appName(), "Could not stop " + app.appName());
    }

    AppActionResult restart(InstalledApp app, Path composeFile) {
        RuntimeModels.DockerComposeResult result = composeExecutor.restart(composeFile, app.composeProject());
        return completeAction(app, "restart", result, "Restarted " + app.appName(), "Could not restart " + app.appName());
    }

    private AppActionResult completeAction(InstalledApp app, String action, RuntimeModels.DockerComposeResult result, String successMessage, String failureMessage) {
        if (result.successful()) {
            repository.recordEvent(app.appId(), action, successMessage + ".");
            activitySuccess(action, successMessage, successMessage + ".", app.appId());
            AppRuntimeView view = viewRefresher.apply(app);
            return new AppActionResult(app.appId(), action, "completed", successMessage + ".", view, result.output(), Instant.now());
        }
        repository.recordEvent(app.appId(), action + "_failed", String.join("\n", result.output()));
        activityWarning(action + "_failed", failureMessage, failureReason(result.output()), app.appId());
        throw new InstallationException(lifecycleFailureMessage(failureMessage, result.output()));
    }

    private String lifecycleFailureMessage(String fallbackMessage, List<String> output) {
        String outputText = output == null ? "" : String.join("\n", output);
        Matcher portConflict = HOST_PORT_CONFLICT.matcher(outputText);
        if (portConflict.find()) {
            return "Port " + portConflict.group(1) + " is already in use. Stop the service using that port or change the app port, then try again.";
        }
        return fallbackMessage + ". Check recent activity for details.";
    }

    private String failureReason(List<String> output) {
        String reason = output == null ? "" : String.join("\n", output).trim();
        return firstPresent(reason, "The lifecycle command failed without returning details.");
    }

    private String firstPresent(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private void activitySuccess(String action, String title, String message, String appId) {
        if (activityLogService != null) {
            activityLogService.success("applications", action, title, message, appId);
        }
    }

    private void activityWarning(String action, String title, String message, String appId) {
        if (activityLogService != null) {
            activityLogService.warning("applications", action, title, message, appId);
        }
    }
}

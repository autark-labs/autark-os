package com.autarkos.marketplace.install;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.apps.ApplicationViews;
import com.autarkos.automation.AutomationService;
import com.autarkos.backups.RecoveryOperationConflictException;
import com.autarkos.marketplace.install.models.InstallModels;

@Service
public class AppGuardianService {

    private static final Duration REPAIR_RATE_LIMIT = Duration.ofMinutes(5);

    private final InstalledAppRepository repository;
    private final AppLifecycleService appLifecycleService;
    private final boolean enabled;
    private final ActivityLogService activityLogService;
    private final AutomationService automationService;
    private final ApplicationStateService applicationStateService;
    private final AtomicBoolean running = new AtomicBoolean(false);

    public AppGuardianService(InstalledAppRepository repository, AppLifecycleService appLifecycleService,
            @Value("${autark-os.guardian.enabled:true}") boolean enabled,
            ActivityLogService activityLogService, AutomationService automationService,
            ApplicationStateService applicationStateService) {
        this.repository = repository;
        this.appLifecycleService = appLifecycleService;
        this.enabled = enabled;
        this.activityLogService = activityLogService;
        this.automationService = automationService;
        this.applicationStateService = applicationStateService;
    }

    @Scheduled(
            initialDelayString = "${autark-os.guardian.initial-delay-ms:10000}",
            fixedDelayString = "${autark-os.guardian.interval-ms:15000}")
    public void inspectAndRepair() {
        if (!enabled || !running.compareAndSet(false, true)) {
            return;
        }
        try {
            Map<String, AppRuntimeView> runtimeByAppId = ApplicationViews.managedRuntimes(applicationStateService.snapshot()).stream()
                    .collect(Collectors.toMap(AppRuntimeView::appId, view -> view, (left, right) -> left));
            for (InstalledApp app : managedInstalledAppsFromSnapshot(runtimeByAppId.keySet())) {
                inspectApp(app, runtimeByAppId.get(app.appId()));
            }
        } finally {
            running.set(false);
        }
    }

    private void inspectApp(InstalledApp app, AppRuntimeView runtimeView) {
        if (runtimeView == null || runtimeView.healthSnapshot() == null) {
            return;
        }
        if (!automationService.recipeEnabled(AutomationService.RESTART_UNHEALTHY_APP)) {
            return;
        }
        InstallModels.InstallSettings settings = repository.settingsFor(app.appId()).orElseGet(() -> InstallModels.InstallSettings.defaults(app.accessUrl()));
        if (!settings.autoRepairEnabled()) {
            return;
        }
        AppHealthSnapshot snapshot = runtimeView.healthSnapshot();
        if (!shouldRepair(snapshot) || recentlyAttempted(settings)) {
            return;
        }
        repository.recordEvent(app.appId(), "guardian_issue_detected", "Autark-OS noticed " + app.appName() + " needs attention: " + snapshot.message() + ".");
        activityLogService.warning("stability", "guardian_issue_detected", app.appName() + " needs attention", snapshot.message(), app.appId());
        Instant attemptAt = Instant.now();
        saveGuardianState(app, settings, "guardian_repair_queued", attemptAt);
        try {
            appLifecycleService.repair(app.appId(), true);
        } catch (RecoveryOperationConflictException exception) {
            saveGuardianState(app, settings, "guardian_repair_deferred", attemptAt);
            repository.recordEvent(app.appId(), "guardian_repair_deferred", "Autark-OS will retry repair after the active recovery operation finishes.");
            activityLogService.info("stability", "guardian_repair_deferred", "Automatic repair deferred for " + app.appName(), exception.getMessage(), app.appId());
        } catch (RuntimeException exception) {
            saveGuardianState(app, settings, blockedByOwnership(exception) ? "guardian_repair_blocked" : "guardian_repair_failed", attemptAt);
            if (!hasRecentGuardianFailure(app.appId())) {
                repository.recordEvent(app.appId(), "guardian_repair_failed", "Autark-OS could not repair " + app.appName() + ". Reason: " + failureReason(exception));
                activityLogService.error("stability", "guardian_repair_failed", "Automatic repair failed for " + app.appName(), failureReason(exception), app.appId(), exception);
            }
        }
    }

    private boolean shouldRepair(AppHealthSnapshot snapshot) {
        return !snapshot.startupGrace() && (AutarkOsStates.AppStatus.NEEDS_ATTENTION.equals(snapshot.status()) || AutarkOsStates.AppStatus.UNAVAILABLE.equals(snapshot.status()));
    }

    private boolean recentlyAttempted(InstallModels.InstallSettings settings) {
        return settings.lastRepairAttemptAt() != null && settings.lastRepairAttemptAt().plus(REPAIR_RATE_LIMIT).isAfter(Instant.now());
    }

    private void saveGuardianState(InstalledApp app, InstallModels.InstallSettings settings, String status, Instant attemptAt) {
        repository.saveSettings(app.appId(), new InstallModels.InstallSettings(
                settings.accessUrl(),
                settings.privateAccessUrl(),
                settings.tailscaleEnabled(),
                settings.storageSubfolders(),
                settings.backup(),
                settings.desiredAccessMode(),
                settings.privateAccessRequirement(),
                settings.expectedLocalPort(),
                settings.expectedProtocol(),
                settings.lastAccessCheckAt(),
                settings.lastSuccessfulAccessAt(),
                attemptAt,
                status,
                settings.autoRepairEnabled()));
    }

    private boolean blockedByOwnership(RuntimeException exception) {
        String message = exception.getMessage();
        return message != null && (message.contains("not owned by this Autark-OS instance")
                || message.contains("not fully managed"));
    }

    private String failureReason(RuntimeException exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? "No failure reason was returned." : message;
    }

    private boolean hasRecentGuardianFailure(String appId) {
        Instant cutoff = Instant.now().minusSeconds(10);
        return repository.eventsFor(appId, 5).stream()
                .anyMatch(event -> "guardian_repair_failed".equals(event.type()) && event.createdAt().isAfter(cutoff));
    }

    private List<InstalledApp> managedInstalledAppsFromSnapshot(java.util.Set<String> managedIds) {
        return repository.findAllApps().stream()
                .filter(app -> managedIds.contains(app.appId()))
                .toList();
    }
}

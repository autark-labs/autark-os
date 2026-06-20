package com.projectos.automation;

import com.projectos.automation.api.AutomationRecipeUpdateRequest;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.projectos.activity.ActivityLog;
import com.projectos.activity.ActivityLogService;
import com.projectos.marketplace.install.InstallationException;
import com.projectos.system.ProjectSettings;
import com.projectos.system.ProjectSettingsRepository;
import com.projectos.system.ProjectSettingsService;

@Service
public class AutomationService {

    public static final String BACKUP_BEFORE_UPDATE = "backup-before-update";
    public static final String RESTART_UNHEALTHY_APP = "restart-unhealthy-app";
    public static final String LOW_DISK_SPACE_ATTENTION = "low-disk-space-attention";
    public static final String REPAIR_MISSING_PRIVATE_LINK = "repair-missing-private-link";
    public static final String NOTIFY_BACKUP_FAILURE = "notify-backup-failure";

    private static final String ACTIVE = "active";
    private static final String PREVIEW = "preview";
    private static final Set<String> RECIPE_IDS = Set.of(
            BACKUP_BEFORE_UPDATE,
            RESTART_UNHEALTHY_APP,
            LOW_DISK_SPACE_ATTENTION,
            REPAIR_MISSING_PRIVATE_LINK,
            NOTIFY_BACKUP_FAILURE);

    private final ProjectSettingsService settingsService;
    private final ProjectSettingsRepository settingsRepository;
    private final ActivityLogService activityLogService;

    public AutomationService(ProjectSettingsService settingsService, ProjectSettingsRepository settingsRepository, ActivityLogService activityLogService) {
        this.settingsService = settingsService;
        this.settingsRepository = settingsRepository;
        this.activityLogService = activityLogService;
    }

    public List<AutomationRecipe> recipes() {
        ProjectSettings settings = settingsService.current();
        Map<String, String> rawSettings = settingsRepository.readAll();
        List<ActivityLog> recentActivity = activityLogService.recent(150);
        return List.of(
                backupBeforeUpdate(rawSettings, recentActivity),
                restartUnhealthyApp(settings, recentActivity),
                lowDiskSpaceAttention(rawSettings, recentActivity),
                repairMissingPrivateLink(rawSettings, recentActivity),
                notifyBackupFailure(rawSettings, recentActivity));
    }

    public AutomationRecipe update(String recipeId, AutomationRecipeUpdateRequest request) {
        if (!RECIPE_IDS.contains(recipeId)) {
            throw new InstallationException("Unknown automation recipe: " + recipeId + ".");
        }
        if (BACKUP_BEFORE_UPDATE.equals(recipeId)) {
            throw new InstallationException("Backup before update is a required safety check and cannot be disabled.");
        }

        if (RESTART_UNHEALTHY_APP.equals(recipeId)) {
            ProjectSettings current = settingsService.current();
            settingsService.update(new ProjectSettings(
                    current.deviceName(),
                    current.timeZone(),
                    current.language(),
                    current.temperatureUnit(),
                    current.dateFormat(),
                    current.timeFormat(),
                    current.startOnBoot(),
                    current.telemetryEnabled(),
                    current.defaultInstallAccess(),
                    request.enabled(),
                    current.automaticBackupsEnabled(),
                    current.backupFrequency(),
                    current.backupRetentionDays(),
                    current.backupTime(),
                    current.updateChannel(),
                    current.showAdvancedMetrics(),
                    Instant.now()));
        } else {
            settingsRepository.saveValues(Map.of(settingKey(recipeId), Boolean.toString(request.enabled())));
        }

        activityLogService.info(
                "automation",
                request.enabled() ? "automation_recipe_enabled" : "automation_recipe_disabled",
                "Automation recipe updated",
                recipeTitle(recipeId) + " is now " + (request.enabled() ? "enabled." : "disabled."));

        return recipes().stream()
                .filter(recipe -> recipe.id().equals(recipeId))
                .findFirst()
                .orElseThrow(() -> new InstallationException("Automation recipe disappeared after update."));
    }

    public boolean recipeEnabled(String recipeId) {
        if (BACKUP_BEFORE_UPDATE.equals(recipeId)) {
            return true;
        }
        if (RESTART_UNHEALTHY_APP.equals(recipeId)) {
            return settingsService.current().automaticRepairEnabled();
        }
        Map<String, String> rawSettings = settingsRepository.readAll();
        return bool(rawSettings, settingKey(recipeId), defaultEnabled(recipeId));
    }

    private AutomationRecipe backupBeforeUpdate(Map<String, String> settings, List<ActivityLog> recentActivity) {
        ActivityLog last = findLast(recentActivity, "applications", "update_backup_");
        return recipe(
                BACKUP_BEFORE_UPDATE,
                "Backup before update",
                "Project OS creates a backup checkpoint before managed app updates.",
                "When an app update starts",
                "Create and verify a backup checkpoint before changing containers",
                "Required guardrail. This cannot be disabled from Automation.",
                ACTIVE,
                true,
                false,
                last);
    }

    private AutomationRecipe restartUnhealthyApp(ProjectSettings settings, List<ActivityLog> recentActivity) {
        ActivityLog last = findLast(recentActivity, "stability", "guardian_");
        return recipe(
                RESTART_UNHEALTHY_APP,
                "Restart unhealthy app",
                "Project OS can try one safe repair when an app stays unavailable.",
                "When an installed app stays unhealthy after startup",
                "Run one managed restart or private-link repair, then record the result",
                "Rate-limited to avoid restart loops. Per-app automatic fixes still apply.",
                ACTIVE,
                settings.automaticRepairEnabled(),
                true,
                last);
    }

    private AutomationRecipe lowDiskSpaceAttention(Map<String, String> settings, List<ActivityLog> recentActivity) {
        ActivityLog last = findLast(recentActivity, "system", "storage_");
        return recipe(
                LOW_DISK_SPACE_ATTENTION,
                "Low disk space attention",
                "Project OS can raise clear cleanup guidance when storage gets tight.",
                "When Project OS runtime storage crosses a warning threshold",
                "Show attention cards and recommend safe cleanup steps",
                "Preview only. Cleanup still requires a user click.",
                PREVIEW,
                bool(settings, settingKey(LOW_DISK_SPACE_ATTENTION), true),
                true,
                last);
    }

    private AutomationRecipe repairMissingPrivateLink(Map<String, String> settings, List<ActivityLog> recentActivity) {
        ActivityLog last = findLast(recentActivity, "applications", "private_access_");
        return recipe(
                REPAIR_MISSING_PRIVATE_LINK,
                "Repair missing private link",
                "Project OS can reconcile Tailscale Serve when an app's private link drifts.",
                "When a private app no longer matches the expected Tailscale Serve mapping",
                "Offer or run a managed repair through the existing private-access flow",
                "Uses Project OS-owned app ports only and records activity for each repair.",
                ACTIVE,
                bool(settings, settingKey(REPAIR_MISSING_PRIVATE_LINK), true),
                true,
                last);
    }

    private AutomationRecipe notifyBackupFailure(Map<String, String> settings, List<ActivityLog> recentActivity) {
        ActivityLog last = recentActivity.stream()
                .filter(activity -> "backup".equals(activity.category()) && "failed".equals(activity.outcome()))
                .findFirst()
                .orElse(null);
        return recipe(
                NOTIFY_BACKUP_FAILURE,
                "Notify when backup fails",
                "Project OS can surface failed backups on Overview and Monitoring.",
                "When a routine or manual backup fails verification",
                "Raise a visible attention item with the failure reason",
                "Preview until delivery channels like email or mobile push exist.",
                PREVIEW,
                bool(settings, settingKey(NOTIFY_BACKUP_FAILURE), true),
                true,
                last);
    }

    private AutomationRecipe recipe(String id, String title, String summary, String trigger, String action, String safetyLimit, String status, boolean enabled, boolean configurable, ActivityLog last) {
        return new AutomationRecipe(
                id,
                title,
                summary,
                trigger,
                action,
                safetyLimit,
                status,
                enabled,
                configurable,
                last == null ? "No recent runs" : last.createdAt().toString(),
                last == null ? "Waiting for the next matching event." : last.title() + ": " + last.message(),
                Instant.now());
    }

    private ActivityLog findLast(List<ActivityLog> recentActivity, String category, String actionPrefix) {
        return recentActivity.stream()
                .filter(activity -> category.equals(activity.category()))
                .filter(activity -> activity.action() != null && activity.action().startsWith(actionPrefix))
                .findFirst()
                .orElse(null);
    }

    private boolean bool(Map<String, String> settings, String key, boolean fallback) {
        String value = settings.get(key);
        return value == null || value.isBlank() ? fallback : Boolean.parseBoolean(value);
    }

    private boolean defaultEnabled(String recipeId) {
        return switch (recipeId) {
            case LOW_DISK_SPACE_ATTENTION, REPAIR_MISSING_PRIVATE_LINK, NOTIFY_BACKUP_FAILURE -> true;
            default -> false;
        };
    }

    private String settingKey(String recipeId) {
        return "automation." + recipeId + ".enabled";
    }

    private String recipeTitle(String recipeId) {
        return switch (recipeId) {
            case BACKUP_BEFORE_UPDATE -> "Backup before update";
            case RESTART_UNHEALTHY_APP -> "Restart unhealthy app";
            case LOW_DISK_SPACE_ATTENTION -> "Low disk space attention";
            case REPAIR_MISSING_PRIVATE_LINK -> "Repair missing private link";
            case NOTIFY_BACKUP_FAILURE -> "Notify when backup fails";
            default -> recipeId;
        };
    }
}

package com.autarkos.marketplace.install;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.ReliabilityModels;

/** Builds the repository-backed reliability view used by monitoring and support. */
public final class AppReliabilityService {

    private final InstalledAppRepository repository;

    public AppReliabilityService(InstalledAppRepository repository) {
        this.repository = repository;
    }

    public ReliabilityModels.AppReliabilitySummary summarize(List<InstalledApp> apps) {
        Instant checkedAt = Instant.now();
        int ready = countByStatus(apps, AutarkOsStates.AppStatus.READY);
        int starting = countByStatus(apps, AutarkOsStates.AppStatus.STARTING);
        int paused = countByStatus(apps, AutarkOsStates.AppStatus.PAUSED);
        int needsAttention = countByStatus(apps, AutarkOsStates.AppStatus.NEEDS_ATTENTION);
        int unavailable = countByStatus(apps, AutarkOsStates.AppStatus.UNAVAILABLE);
        List<ReliabilityModels.AppReliabilityIssue> issues = apps.stream()
                .filter(this::hasReliabilityIssue)
                .map(this::reliabilityIssue)
                .toList();
        List<ReliabilityModels.AppReliabilityActivity> allActivity = apps.stream()
                .flatMap(app -> repository.eventsFor(app.appId(), 20).stream()
                        .filter(this::isReliabilityEvent)
                        .map(event -> reliabilityActivity(app, event)))
                .sorted((left, right) -> right.createdAt().compareTo(left.createdAt()))
                .toList();
        Instant recentWindow = checkedAt.minus(Duration.ofHours(24));
        int successfulRepairs = countActivityByTone(allActivity, recentWindow, "success");
        int failedRepairs = countActivityByTone(allActivity, recentWindow, "danger");
        String posture = issues.isEmpty() ? "healthy" : unavailable > 0 ? "critical" : "warning";

        return new ReliabilityModels.AppReliabilitySummary(
                posture,
                reliabilityHeadline(posture),
                reliabilitySummaryText(posture, issues.size(), successfulRepairs, failedRepairs),
                apps.size(),
                ready,
                starting,
                paused,
                needsAttention,
                unavailable,
                (int) apps.stream().filter(app -> settingsFor(app).tailscaleEnabled()).count(),
                (int) apps.stream().filter(app -> settingsFor(app).autoRepairEnabled()).count(),
                successfulRepairs,
                failedRepairs,
                issues,
                allActivity.stream().limit(10).toList(),
                checkedAt);
    }

    private int countByStatus(List<InstalledApp> apps, String status) {
        return (int) apps.stream().filter(app -> status.equals(displayHealthStatus(app))).count();
    }

    private int countActivityByTone(List<ReliabilityModels.AppReliabilityActivity> activity, Instant since, String tone) {
        return (int) activity.stream()
                .filter(item -> item.createdAt().isAfter(since))
                .filter(item -> tone.equals(item.tone()))
                .count();
    }

    private boolean hasReliabilityIssue(InstalledApp app) {
        String status = displayHealthStatus(app);
        return AutarkOsStates.AppStatus.NEEDS_ATTENTION.equals(status)
                || AutarkOsStates.AppStatus.UNAVAILABLE.equals(status)
                || privateLinkMissing(app);
    }

    private ReliabilityModels.AppReliabilityIssue reliabilityIssue(InstalledApp app) {
        AppHealthSnapshot health = repository.healthFor(app.appId()).orElse(null);
        boolean privateMissing = privateLinkMissing(app);
        String message = privateMissing ? "Private link is missing" : health == null ? "Waiting for health check" : health.message();
        String detail = privateMissing
                ? "Autark-OS expects a private link for this app, but Tailscale Serve does not currently have one configured."
                : health == null ? "Autark-OS has not recorded a health check for this app yet." : health.detail();
        return new ReliabilityModels.AppReliabilityIssue(
                app.appId(),
                app.appName(),
                displayHealthStatus(app),
                message,
                detail,
                privateMissing ? "Repair private link" : "Try to fix",
                !AutarkOsStates.AppStatus.PAUSED.equals(displayHealthStatus(app)),
                health == null ? Instant.now() : health.checkedAt());
    }

    private String displayHealthStatus(InstalledApp app) {
        AppHealthSnapshot health = repository.healthFor(app.appId()).orElse(null);
        if (health != null && health.status() != null) {
            return health.status();
        }
        return switch (app.status()) {
            case AutarkOsStates.AppStatus.READY,
                    AutarkOsStates.AppStatus.STARTING,
                    AutarkOsStates.AppStatus.NEEDS_ATTENTION,
                    AutarkOsStates.AppStatus.UNAVAILABLE,
                    AutarkOsStates.AppStatus.PAUSED -> app.status();
            case AutarkOsStates.AppStatus.STOPPED -> AutarkOsStates.AppStatus.PAUSED;
            case AutarkOsStates.AppStatus.INSTALLED -> AutarkOsStates.AppStatus.READY;
            default -> AutarkOsStates.AppStatus.STARTING;
        };
    }

    private boolean privateLinkMissing(InstalledApp app) {
        InstallModels.InstallSettings settings = settingsFor(app);
        return settings.tailscaleEnabled() && (settings.privateAccessUrl() == null || settings.privateAccessUrl().isBlank());
    }

    private InstallModels.InstallSettings settingsFor(InstalledApp app) {
        return repository.settingsFor(app.appId()).orElseGet(() -> InstallModels.InstallSettings.defaults(app.accessUrl()));
    }

    private boolean isReliabilityEvent(AppEvent event) {
        return event.type().startsWith("guardian_")
                || event.type().contains("repair")
                || event.type().contains("health")
                || event.type().contains("private_access");
    }

    private ReliabilityModels.AppReliabilityActivity reliabilityActivity(InstalledApp app, AppEvent event) {
        return new ReliabilityModels.AppReliabilityActivity(
                event.id(),
                app.appId(),
                app.appName(),
                event.type(),
                event.message(),
                eventTone(event),
                event.createdAt());
    }

    private String eventTone(AppEvent event) {
        if (event.type().contains("failed")) return "danger";
        if (event.type().contains("completed") || event.type().equals("private_access_enabled")) return "success";
        if (event.type().contains("detected") || event.type().contains("started") || event.type().contains("health_changed")) return "warning";
        return "neutral";
    }

    private String reliabilityHeadline(String posture) {
        return switch (posture) {
            case "healthy" -> "Apps are stable";
            case "critical" -> "Some apps need help";
            default -> "Stability needs a quick review";
        };
    }

    private String reliabilitySummaryText(String posture, int issueCount, int successfulRepairs, int failedRepairs) {
        if ("healthy".equals(posture)) {
            return successfulRepairs > 0
                    ? "Autark-OS recently fixed issues and no apps currently need attention."
                    : "No app stability issues are currently reported.";
        }
        if (failedRepairs > 0) {
            return "Autark-OS found " + issueCount + " issue(s), and at least one repair needs your review.";
        }
        return "Autark-OS found " + issueCount + " issue(s) and will try safe fixes when automatic repair is enabled.";
    }
}

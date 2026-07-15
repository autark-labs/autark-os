package com.autarkos.marketplace.install;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.ReliabilityModels;
import com.autarkos.network.tailscale.TailscaleServeConfig;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.network.tailscale.TailscaleStatus;

/** Builds the repository-backed reliability view used by monitoring and support. */
public final class AppReliabilityService {

    private final InstalledAppRepository repository;
    private final TailscaleService tailscaleService;
    private final PrivateAccessStateResolver privateAccessStateResolver;

    public AppReliabilityService(InstalledAppRepository repository, TailscaleService tailscaleService) {
        this.repository = repository;
        this.tailscaleService = tailscaleService;
        this.privateAccessStateResolver = new PrivateAccessStateResolver(repository, tailscaleService);
    }

    public ReliabilityModels.AppReliabilitySummary summarize(List<InstalledApp> apps) {
        Instant checkedAt = Instant.now();
        Map<String, PrivateAccessState> privateAccessByApp = privateAccessStates(apps);
        int ready = countByStatus(apps, AutarkOsStates.AppStatus.READY);
        int starting = countByStatus(apps, AutarkOsStates.AppStatus.STARTING);
        int paused = countByStatus(apps, AutarkOsStates.AppStatus.PAUSED);
        int needsAttention = countByStatus(apps, AutarkOsStates.AppStatus.NEEDS_ATTENTION);
        int unavailable = countByStatus(apps, AutarkOsStates.AppStatus.UNAVAILABLE);
        List<ReliabilityModels.AppReliabilityIssue> issues = apps.stream()
                .filter(app -> hasReliabilityIssue(app, privateAccessByApp.get(app.appId())))
                .map(app -> reliabilityIssue(app, privateAccessByApp.get(app.appId())))
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
                (int) privateAccessByApp.values().stream().filter(PrivateAccessState::requested).count(),
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

    private boolean hasReliabilityIssue(InstalledApp app, PrivateAccessState privateAccess) {
        String status = displayHealthStatus(app);
        return AutarkOsStates.AppStatus.NEEDS_ATTENTION.equals(status)
                || AutarkOsStates.AppStatus.UNAVAILABLE.equals(status)
                || privateAccess != null && privateAccess.needsAttention();
    }

    private ReliabilityModels.AppReliabilityIssue reliabilityIssue(InstalledApp app, PrivateAccessState privateAccess) {
        AppHealthSnapshot health = repository.healthFor(app.appId()).orElse(null);
        boolean privateNeedsAttention = privateAccess != null && privateAccess.needsAttention();
        String message = privateNeedsAttention ? privateAccess.message() : health == null ? "Waiting for health check" : health.message();
        String detail = privateNeedsAttention
                ? privateAccess.detail()
                : health == null ? "Autark-OS has not recorded a health check for this app yet." : health.detail();
        return new ReliabilityModels.AppReliabilityIssue(
                app.appId(),
                app.appName(),
                displayHealthStatus(app),
                message,
                detail,
                privateNeedsAttention ? "Repair private link" : "Try to fix",
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

    private InstallModels.InstallSettings settingsFor(InstalledApp app) {
        return repository.settingsFor(app.appId()).orElseGet(() -> InstallModels.InstallSettings.defaults(app.accessUrl()));
    }

    private Map<String, PrivateAccessState> privateAccessStates(List<InstalledApp> apps) {
        TailscaleStatus tailscale = tailscaleService.status();
        TailscaleServeConfig config = tailscale.connected()
                ? tailscaleService.serveConfig()
                : TailscaleServeConfig.unavailable("not_connected", "Tailscale is not connected.", List.of());
        return apps.stream().collect(Collectors.toMap(
                InstalledApp::appId,
                app -> privateAccessStateResolver.resolve(app.appId(), settingsFor(app), app.accessUrl(), tailscale, config),
                (left, right) -> left));
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

package com.projectos.system;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.projectos.activity.ActivityLog;
import com.projectos.activity.ActivityLogService;
import com.projectos.backups.BackupReport;
import com.projectos.backups.BackupService;
import com.projectos.marketplace.install.AppLifecycleService;
import com.projectos.marketplace.install.AppReliabilitySummary;
import com.projectos.marketplace.install.PrivateAccessReconciliationReport;
import com.projectos.marketplace.install.PrivateAccessReconciliationService;

@Service
public class SystemSupportService {

    private static final int DEFAULT_LOG_LIMIT = 120;
    private static final int MAX_LOG_LIMIT = 400;
    private static final Pattern SECRET_ASSIGNMENT = Pattern.compile("(?i)(password|passwd|token|secret|api[_-]?key|auth|credential)(\\s*[=:]\\s*)([^\\s,;]+)");
    private static final Pattern JSON_SECRET = Pattern.compile("(?i)(\"(?:password|passwd|token|secret|api[_-]?key|auth|credential)\"\\s*:\\s*\")([^\"]+)(\")");
    private static final Pattern BEARER_TOKEN = Pattern.compile("(?i)(bearer\\s+)([a-z0-9._~+/=-]{12,})");
    private static final Pattern TAILSCALE_DNS = Pattern.compile("(?i)(https?://)?[a-z0-9-]+\\.[a-z0-9-]+\\.ts\\.net(:\\d+)?");
    private static final Pattern TAILSCALE_IP = Pattern.compile("\\b100\\.(6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\.\\d{1,3}\\.\\d{1,3}\\b");

    private final ActivityLogService activityLogService;
    private final SystemMetricsService metricsService;
    private final SystemSetupService setupService;
    private final AppLifecycleService appLifecycleService;
    private final PrivateAccessReconciliationService privateAccessReconciliationService;
    private final StorageService storageService;
    private final BackupService backupService;
    private final ProjectVersionService versionService;
    private final Function<List<String>, CommandResult> commandRunner;

    @Autowired
    public SystemSupportService(
            ActivityLogService activityLogService,
            SystemMetricsService metricsService,
            SystemSetupService setupService,
            AppLifecycleService appLifecycleService,
            PrivateAccessReconciliationService privateAccessReconciliationService,
            StorageService storageService,
            BackupService backupService,
            ProjectVersionService versionService) {
        this(activityLogService, metricsService, setupService, appLifecycleService, privateAccessReconciliationService, storageService, backupService, versionService, SystemSupportService::runProcess);
    }

    SystemSupportService(ActivityLogService activityLogService, SystemMetricsService metricsService, SystemSetupService setupService, Function<List<String>, CommandResult> commandRunner) {
        this(activityLogService, metricsService, setupService, null, null, null, null, null, commandRunner);
    }

    SystemSupportService(
            ActivityLogService activityLogService,
            SystemMetricsService metricsService,
            SystemSetupService setupService,
            AppLifecycleService appLifecycleService,
            PrivateAccessReconciliationService privateAccessReconciliationService,
            StorageService storageService,
            BackupService backupService,
            ProjectVersionService versionService,
            Function<List<String>, CommandResult> commandRunner) {
        this.activityLogService = activityLogService;
        this.metricsService = metricsService;
        this.setupService = setupService;
        this.appLifecycleService = appLifecycleService;
        this.privateAccessReconciliationService = privateAccessReconciliationService;
        this.storageService = storageService;
        this.backupService = backupService;
        this.versionService = versionService;
        this.commandRunner = commandRunner;
    }

    public SupportSummary summary() {
        SupportContext context = supportContext(30);
        return new SupportSummary(
                context.setup().status(),
                supportHeadline(context.setup(), context.failures().size(), context.findings().size()),
                supportSummary(context.setup(), context.failures().size(), context.findings().size()),
                true,
                context.backendHealth(),
                context.dockerStatus(),
                context.tailscaleStatus(),
                context.serviceStatus(),
                context.version(),
                context.failures().size(),
                context.findings(),
                context.redactionRules(),
                context.commands(),
                context.checkedAt());
    }

    public List<SupportLogLine> logs(int limit) {
        int safeLimit = Math.max(25, Math.min(limit <= 0 ? DEFAULT_LOG_LIMIT : limit, MAX_LOG_LIMIT));
        CommandResult journal = commandRunner.apply(List.of("journalctl", "-u", "project-os.service", "-n", String.valueOf(safeLimit), "--no-pager"));
        if (journal.successful() && !journal.output().isBlank()) {
            return journal.output().lines()
                    .map(this::logLine)
                    .toList();
        }
        return activityLogService.recent(Math.min(safeLimit, 100)).stream()
                .map(log -> logLine(log.createdAt() + " " + log.level().toUpperCase(Locale.ROOT) + " " + log.category() + " " + log.title() + " - " + log.message()))
                .toList();
    }

    public SupportBundle bundle() {
        SupportContext context = supportContext(30);
        SystemMetrics metrics = metricsService.metrics();
        List<ActivityLog> recentActivity = redactedActivity(activityLogService.recent(80));
        List<ActivityLog> recentFailures = redactedActivity(context.failures());
        List<SupportLogLine> logs = logs(120);
        String headline = supportHeadline(context.setup(), context.failures().size(), context.findings().size());
        String summary = supportSummary(context.setup(), context.failures().size(), context.findings().size());
        String bundleText = bundleText(context, headline, summary, metrics, recentActivity, recentFailures, logs);
        return new SupportBundle(
                context.setup().status(),
                headline,
                summary,
                true,
                context.backendHealth(),
                context.dockerStatus(),
                context.tailscaleStatus(),
                context.serviceStatus(),
                context.version(),
                context.setup(),
                metrics,
                context.domainSummaries(),
                recentActivity,
                recentFailures,
                logs,
                context.findings(),
                context.redactionRules(),
                context.commands(),
                bundleText,
                context.failures().size(),
                Instant.now());
    }

    private SupportContext supportContext(int failureLimit) {
        SystemSetupStatus setup = setupService.status();
        ProjectVersionInfo version = versionInfo();
        List<ActivityLog> failures = recentFailures(failureLimit);
        List<SupportDomainSummary> domainSummaries = domainSummaries();
        List<SupportFinding> findings = findings(setup, failures, domainSummaries);
        List<SupportRedactionRule> redactionRules = redactionRules();
        List<SupportCommand> commands = safeCommands(setup);
        return new SupportContext(
                setup,
                version,
                failures,
                domainSummaries,
                findings,
                redactionRules,
                commands,
                "ok",
                checkStatus(setup, SystemCapabilityCatalog.DOCKER),
                checkStatus(setup, SystemCapabilityCatalog.TAILSCALE),
                checkStatus(setup, SystemCapabilityCatalog.SYSTEMD),
                Instant.now());
    }

    private List<SupportDomainSummary> domainSummaries() {
        List<SupportDomainSummary> summaries = new ArrayList<>();
        summaries.add(applicationsSummary());
        summaries.add(privateAccessSummary());
        summaries.add(storageSummary());
        summaries.add(backupSummary());
        return summaries;
    }

    private SupportDomainSummary applicationsSummary() {
        if (appLifecycleService == null) {
            return unavailableSummary("applications", "Applications");
        }
        try {
            AppReliabilitySummary reliability = appLifecycleService.reliabilitySummary();
            return new SupportDomainSummary(
                    "applications",
                    "Applications",
                    reliability.posture(),
                    redact(reliability.headline()),
                    "%d installed, %d ready, %d need attention, %d unavailable, %d private."
                            .formatted(reliability.totalApps(), reliability.readyApps(), reliability.needsAttentionApps(), reliability.unavailableApps(), reliability.privateApps()));
        } catch (RuntimeException exception) {
            return failedSummary("applications", "Applications", exception);
        }
    }

    private SupportDomainSummary privateAccessSummary() {
        if (privateAccessReconciliationService == null) {
            return unavailableSummary("private-access", "Private access");
        }
        try {
            PrivateAccessReconciliationReport report = privateAccessReconciliationService.report();
            return new SupportDomainSummary(
                    "private-access",
                    "Private access",
                    report.status(),
                    redact(report.headline()),
                    redact(report.summary()) + " Stale links: " + report.staleMappings().size() + ".");
        } catch (RuntimeException exception) {
            return failedSummary("private-access", "Private access", exception);
        }
    }

    private SupportDomainSummary storageSummary() {
        if (storageService == null) {
            return unavailableSummary("storage", "Storage");
        }
        try {
            StorageReport report = storageService.report();
            return new SupportDomainSummary(
                    "storage",
                    "Storage",
                    report.status(),
                    redact(report.headline()),
                    redact(report.summary()) + " Apps using storage: " + report.apps().size() + ". Orphaned folders: " + report.orphanedData().size() + ".");
        } catch (RuntimeException exception) {
            return failedSummary("storage", "Storage", exception);
        }
    }

    private SupportDomainSummary backupSummary() {
        if (backupService == null) {
            return unavailableSummary("backups", "Backups");
        }
        try {
            BackupReport report = backupService.report();
            return new SupportDomainSummary(
                    "backups",
                    "Backups",
                    report.status(),
                    redact(report.headline()),
                    "%d of %d apps protected. %d recent restore point(s). %d failed backup(s)."
                            .formatted(report.protectedApps(), report.totalApps(), report.recentRestorePoints().size(), report.failedBackups()));
        } catch (RuntimeException exception) {
            return failedSummary("backups", "Backups", exception);
        }
    }

    private List<SupportFinding> findings(SystemSetupStatus setup, List<ActivityLog> failures, List<SupportDomainSummary> domainSummaries) {
        List<SupportFinding> findings = new ArrayList<>();
        setup.checks().stream()
                .filter(check -> !"ok".equalsIgnoreCase(check.status()) && !"neutral".equalsIgnoreCase(check.status()))
                .forEach(check -> findings.add(new SupportFinding(
                        "setup-" + check.id(),
                        "Settings",
                        severity(check.status()),
                        redact(check.label()),
                        redact(check.message()),
                        check.actionLabel() == null || check.actionLabel().isBlank() ? "Open Settings" : redact(check.actionLabel()),
                        routeForSetupCheck(check.id()))));

        for (SupportDomainSummary summary : domainSummaries) {
            if (healthyStatus(summary.status())) {
                continue;
            }
            findings.add(new SupportFinding(
                    "domain-" + summary.id(),
                    summary.label(),
                    severity(summary.status()),
                    redact(summary.headline()),
                    redact(summary.summary()),
                    "Open " + summary.label(),
                    routeForDomain(summary.id())));
        }

        if (!failures.isEmpty()) {
            findings.add(new SupportFinding(
                    "recent-failures",
                    "Monitoring",
                    "warning",
                    "Recent failures recorded",
                    failures.size() + " recent failure event" + (failures.size() == 1 ? "" : "s") + " appeared in Project OS activity.",
                    "Open Monitoring",
                    "/monitoring"));
        }
        return findings;
    }

    private List<SupportRedactionRule> redactionRules() {
        return List.of(
                new SupportRedactionRule("secrets", "Secrets and credentials", "Masks passwords, tokens, API keys, auth values, and credential fields in plain text or JSON-like logs."),
                new SupportRedactionRule("tailnet-dns", "Tailnet hostnames", "Masks private ts.net hostnames and private URLs before support data is displayed or copied."),
                new SupportRedactionRule("tailnet-ip", "Tailnet IP addresses", "Masks Tailscale 100.64.0.0/10 addresses that identify private devices."));
    }

    private boolean healthyStatus(String status) {
        return status == null
                || status.isBlank()
                || "healthy".equalsIgnoreCase(status)
                || "ready".equalsIgnoreCase(status)
                || "ok".equalsIgnoreCase(status)
                || "success".equalsIgnoreCase(status)
                || "protected".equalsIgnoreCase(status);
    }

    private String severity(String status) {
        if (status == null) {
            return "info";
        }
        String normalized = status.toLowerCase(Locale.ROOT);
        if (normalized.contains("critical") || normalized.contains("failed") || normalized.contains("error") || normalized.contains("needs_admin_setup")) {
            return "error";
        }
        if (normalized.contains("warning") || normalized.contains("missing") || normalized.contains("mismatched") || normalized.contains("needs") || normalized.contains("unknown")) {
            return "warning";
        }
        return "info";
    }

    private String routeForSetupCheck(String id) {
        return SystemCapabilityCatalog.supportRoute(id);
    }

    private String routeForDomain(String id) {
        return switch (id) {
            case "applications" -> "/applications";
            case "private-access" -> "/network";
            case "storage" -> "/storage";
            case "backups" -> "/backups";
            default -> "/monitoring";
        };
    }

    private SupportDomainSummary unavailableSummary(String id, String label) {
        return new SupportDomainSummary(id, label, "unknown", label + " summary unavailable", "This support context was not available.");
    }

    private SupportDomainSummary failedSummary(String id, String label, RuntimeException exception) {
        return new SupportDomainSummary(id, label, "unknown", label + " summary failed", redact(userMessage(exception)));
    }

    private String userMessage(RuntimeException exception) {
        if (exception.getMessage() == null || exception.getMessage().isBlank()) {
            return "Project OS could not read this support area.";
        }
        return exception.getMessage();
    }

    private List<SupportCommand> safeCommands(SystemSetupStatus setup) {
        List<SupportCommand> commands = new ArrayList<>();
        commands.add(new SupportCommand(
                "service-status",
                "Check service status",
                "Shows whether the production service is running.",
                "sudo systemctl status project-os.service --no-pager",
                "local-terminal"));
        commands.add(new SupportCommand(
                "service-logs",
                "View service logs",
                "Shows recent Project OS backend logs.",
                "sudo journalctl -u project-os.service -n 120 --no-pager",
                "local-terminal"));
        commands.add(new SupportCommand(
                "setup-check",
                "Re-run setup check",
                "Checks the host setup without changing app data.",
                setup.installCommand() + " --check",
                "local-terminal"));
        commands.add(new SupportCommand(
                "project-version",
                "Show Project OS version",
                "Prints version, build, install path, and runtime path.",
                "project-os version",
                "local-terminal"));
        commands.add(new SupportCommand(
                "restart-service",
                "Restart Project OS service",
                "Restarts the production backend service.",
                "sudo systemctl restart project-os.service",
                "local-terminal"));
        return commands;
    }

    private List<ActivityLog> recentFailures(int limit) {
        return activityLogService.recent(limit).stream()
                .filter(log -> "error".equals(log.level()) || "failed".equals(log.outcome()))
                .toList();
    }

    private List<ActivityLog> redactedActivity(List<ActivityLog> logs) {
        return logs.stream()
                .map(log -> new ActivityLog(
                        log.id(),
                        log.level(),
                        log.category(),
                        log.action(),
                        redact(log.title()),
                        redact(log.message()),
                        log.appId(),
                        log.outcome(),
                        redact(log.details()),
                        log.createdAt()))
                .toList();
    }

    private SupportLogLine logLine(String line) {
        String redacted = redact(line);
        return new SupportLogLine(redacted, logLevel(redacted), !redacted.equals(line));
    }

    private String logLevel(String line) {
        String lower = line.toLowerCase(Locale.ROOT);
        if (lower.contains(" error ") || lower.contains("failed") || lower.contains("exception")) {
            return "error";
        }
        if (lower.contains(" warn") || lower.contains("warning") || lower.contains("needs_attention")) {
            return "warning";
        }
        return "info";
    }

    String redact(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String redacted = SECRET_ASSIGNMENT.matcher(value).replaceAll("$1$2[redacted]");
        redacted = JSON_SECRET.matcher(redacted).replaceAll("$1[redacted]$3");
        redacted = BEARER_TOKEN.matcher(redacted).replaceAll("$1[redacted]");
        redacted = TAILSCALE_DNS.matcher(redacted).replaceAll("[tailnet-url-redacted]");
        redacted = TAILSCALE_IP.matcher(redacted).replaceAll("[tailnet-ip-redacted]");
        return redacted;
    }

    private String checkStatus(SystemSetupStatus setup, String id) {
        return setup.checks().stream()
                .filter(check -> id.equals(check.id()))
                .findFirst()
                .map(check -> check.status() + ": " + redact(check.message()))
                .orElse("unknown");
    }

    private String supportHeadline(SystemSetupStatus setup, int failures, int findings) {
        if (findings > 0) {
            return "Support data found items to review";
        }
        if (failures > 0) {
            return "Support data found recent failures";
        }
        if ("ready".equals(setup.status())) {
            return "Support data looks healthy";
        }
        return "Support data has setup items to review";
    }

    private String supportSummary(SystemSetupStatus setup, int failures, int findings) {
        if (findings > 0) {
            return findings + " support finding" + (findings == 1 ? "" : "s") + " can be opened from this page.";
        }
        if (failures > 0) {
            return failures + " recent failure event" + (failures == 1 ? "" : "s") + " are included in the redacted bundle.";
        }
        return setup.summary();
    }

    private ProjectVersionInfo versionInfo() {
        if (versionService != null) {
            return versionService.info();
        }
        return new ProjectVersionInfo("unknown", "unknown", "unknown", "unknown", "unknown", "unknown", "unknown", "unavailable", "Version service is unavailable in this context.", Instant.now());
    }

    private String bundleText(SupportContext context, String headline, String summary, SystemMetrics metrics, List<ActivityLog> recentActivity, List<ActivityLog> recentFailures, List<SupportLogLine> logs) {
        return """
                Project OS Support Bundle
                Generated: %s
                Redaction: enabled

                Summary:
                - %s
                - %s
                - Backend health: %s
                - Docker: %s
                - Tailscale: %s
                - Service: %s

                Version:
                - Version: %s
                - Build SHA: %s
                - Build date: %s
                - Update channel: %s
                - Update status: %s
                - Install path: %s
                - Runtime path: %s
                - Backend jar: %s

                Environment:
                - Run mode: %s
                - Profiles: %s
                - Backend port: %s
                - Java: %s
                - OS: %s %s
                - Runtime root: %s

                System areas:
                %s

                Findings:
                %s

                Redaction rules:
                %s

                Recent failures:
                %s

                Recent activity:
                %s

                Recent logs:
                %s
                """.formatted(
                Instant.now(),
                headline,
                summary,
                context.backendHealth(),
                context.dockerStatus(),
                context.tailscaleStatus(),
                context.serviceStatus(),
                context.version().version(),
                context.version().buildSha(),
                context.version().buildDate(),
                context.version().updateChannel(),
                context.version().updateStatus(),
                context.version().installPath(),
                context.version().runtimePath(),
                context.version().backendJar(),
                context.setup().devMode() ? "dev" : "production",
                context.setup().activeProfiles(),
                context.setup().backendPort(),
                metrics.javaVersion(),
                metrics.osName(),
                metrics.osVersion(),
                metrics.runtimeRoot(),
                domainSummaryText(context.domainSummaries()),
                findingText(context.findings()),
                redactionRuleText(context.redactionRules()),
                activityText(recentFailures),
                activityText(recentActivity),
                logs.stream().map(SupportLogLine::line).collect(Collectors.joining("\n")));
    }

    private String domainSummaryText(List<SupportDomainSummary> summaries) {
        if (summaries.isEmpty()) {
            return "- none";
        }
        return summaries.stream()
                .map(summary -> "- " + summary.label() + " [" + summary.status() + "]: " + redact(summary.headline()) + " - " + redact(summary.summary()))
                .collect(Collectors.joining("\n"));
    }

    private String activityText(List<ActivityLog> activity) {
        if (activity.isEmpty()) {
            return "- none";
        }
        return activity.stream()
                .map(log -> "- " + log.createdAt() + " [" + log.level() + "] " + log.category() + "/" + log.action() + ": " + redact(log.title()) + " - " + redact(log.message()))
                .collect(Collectors.joining("\n"));
    }

    private String findingText(List<SupportFinding> findings) {
        if (findings.isEmpty()) {
            return "- none";
        }
        return findings.stream()
                .map(finding -> "- " + finding.area() + " [" + finding.severity() + "]: " + redact(finding.title()) + " - " + redact(finding.message()) + " (" + finding.route() + ")")
                .collect(Collectors.joining("\n"));
    }

    private String redactionRuleText(List<SupportRedactionRule> rules) {
        return rules.stream()
                .map(rule -> "- " + rule.label() + ": " + rule.description())
                .collect(Collectors.joining("\n"));
    }

    private static CommandResult runProcess(List<String> command) {
        SystemCommandRunner.CommandExecutionResult result = new SystemCommandRunner().run(
                command,
                Duration.ofSeconds(4),
                "Timed out while reading support logs.",
                "Interrupted while reading support logs.");
        return new CommandResult(result.exitCode(), result.output());
    }

    record CommandResult(int exitCode, String output) {
        boolean successful() {
            return exitCode == 0;
        }
    }

    private record SupportContext(
            SystemSetupStatus setup,
            ProjectVersionInfo version,
            List<ActivityLog> failures,
            List<SupportDomainSummary> domainSummaries,
            List<SupportFinding> findings,
            List<SupportRedactionRule> redactionRules,
            List<SupportCommand> commands,
            String backendHealth,
            String dockerStatus,
            String tailscaleStatus,
            String serviceStatus,
            Instant checkedAt) {
    }
}

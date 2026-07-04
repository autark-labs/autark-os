package com.autarkos.pro;

import java.io.File;
import java.lang.management.ManagementFactory;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.apps.ApplicationState;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.backups.BackupModels;
import com.autarkos.backups.BackupService;
import com.autarkos.marketplace.install.AppInstanceView;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.pro.models.ProModels;
import com.autarkos.system.ProjectVersionService;

@Service
public class ProHeartbeatPayloadBuilder {

    private static final List<String> MAY_SEND = List.of(
            "install ID",
            "generated timestamp",
            "Autark-OS version",
            "agent version",
            "coarse system health",
            "disk usage percentage",
            "memory usage percentage when available",
            "app health counts",
            "backup status summary",
            "update status summary when available");

    private static final List<String> NEVER_SENDS = List.of(
            "user files",
            "photos",
            "camera footage",
            "app database contents",
            "backup contents",
            "filenames inside backups",
            "raw logs",
            "secrets",
            "private keys",
            "full network map",
            "DNS history");

    private final ProSettingsRepository repository;
    private final Supplier<Instant> clock;
    private final Supplier<String> versionSupplier;
    private final Supplier<ApplicationState> applicationStateSupplier;
    private final Supplier<BackupModels.BackupReport> backupReportSupplier;
    private final Supplier<Double> diskUsageSupplier;
    private final Supplier<Double> memoryUsageSupplier;

    @Autowired
    public ProHeartbeatPayloadBuilder(
            ProSettingsRepository repository,
            RuntimeLayout runtimeLayout,
            ApplicationStateService applicationStateService,
            BackupService backupService,
            ProjectVersionService versionService) {
        this(
                repository,
                Instant::now,
                () -> versionService.info().version(),
                applicationStateService::snapshot,
                backupService::report,
                () -> diskUsagePercent(runtimeLayout.runtimeRoot().toFile()),
                ProHeartbeatPayloadBuilder::memoryUsagePercent);
    }

    ProHeartbeatPayloadBuilder(
            ProSettingsRepository repository,
            Supplier<Instant> clock,
            Supplier<String> versionSupplier,
            Supplier<ApplicationState> applicationStateSupplier,
            Supplier<BackupModels.BackupReport> backupReportSupplier,
            Supplier<Double> diskUsageSupplier,
            Supplier<Double> memoryUsageSupplier) {
        this.repository = repository;
        this.clock = clock;
        this.versionSupplier = versionSupplier;
        this.applicationStateSupplier = applicationStateSupplier;
        this.backupReportSupplier = backupReportSupplier;
        this.diskUsageSupplier = diskUsageSupplier;
        this.memoryUsageSupplier = memoryUsageSupplier;
    }

    static ProHeartbeatPayloadBuilder minimal(
            ProSettingsRepository repository,
            Supplier<Instant> clock,
            Supplier<String> versionSupplier) {
        return new ProHeartbeatPayloadBuilder(
                repository,
                clock,
                versionSupplier,
                () -> null,
                () -> null,
                () -> null,
                () -> null);
    }

    ProModels.ProPrivacyPayloadPreview preview() {
        ProModels.ProSettings settings = repository.settings()
                .orElseGet(() -> ProModels.ProSettings.defaults(clock.get()));
        Instant generatedAt = clock.get();
        String version = firstPresent(versionSupplier.get(), "0.0.1-SNAPSHOT");
        ApplicationState applicationState = safeGet(applicationStateSupplier);
        BackupModels.BackupReport backupReport = safeGet(backupReportSupplier);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("installId", hasText(settings.installId()) ? settings.installId() : null);
        payload.put("generatedAt", generatedAt);
        payload.put("autarkVersion", version);
        payload.put("agentVersion", version);
        payload.put("coarseSystemHealth", coarseSystemHealth(applicationState, backupReport));
        payload.put("diskUsagePercent", safeGet(diskUsageSupplier));
        payload.put("memoryUsagePercent", safeGet(memoryUsageSupplier));
        payload.put("appHealthCounts", appHealthCounts(applicationState));
        payload.put("backupStatusSummary", backupStatusSummary(backupReport));
        payload.put("updateStatusSummary", null);

        return new ProModels.ProPrivacyPayloadPreview(generatedAt, payload, MAY_SEND, NEVER_SENDS);
    }

    private static Map<String, Object> appHealthCounts(ApplicationState state) {
        Map<String, Object> counts = new LinkedHashMap<>();
        List<AppInstanceView> apps = state == null || state.managedApps() == null ? List.of() : state.managedApps();
        counts.put("total", apps.size());
        counts.put("ready", apps.stream().filter(app -> "ready".equalsIgnoreCase(app.readinessState())).count());
        counts.put("starting", apps.stream().filter(app -> "starting".equalsIgnoreCase(app.readinessState())).count());
        counts.put("paused", apps.stream().filter(app -> "paused".equalsIgnoreCase(app.readinessState())).count());
        counts.put("stopped", apps.stream().filter(app -> "stopped".equalsIgnoreCase(app.readinessState()) || "shutdown".equalsIgnoreCase(app.readinessState())).count());
        counts.put("needsAttention", apps.stream().filter(app -> !"none".equalsIgnoreCase(firstPresent(app.attentionState(), "none"))).count());
        return counts;
    }

    private static Map<String, Object> backupStatusSummary(BackupModels.BackupReport report) {
        Map<String, Object> summary = new LinkedHashMap<>();
        if (report == null) {
            summary.put("status", null);
            summary.put("totalApps", null);
            summary.put("protectedApps", null);
            summary.put("unprotectedApps", null);
            summary.put("failedBackups", null);
            return summary;
        }
        summary.put("status", report.status());
        summary.put("totalApps", report.totalApps());
        summary.put("protectedApps", report.protectedApps());
        summary.put("unprotectedApps", report.unprotectedApps());
        summary.put("failedBackups", report.failedBackups());
        return summary;
    }

    private static String coarseSystemHealth(ApplicationState state, BackupModels.BackupReport backupReport) {
        if (state != null && hasText(state.lastError())) {
            return "attention";
        }
        if (state != null && state.stale()) {
            return "stale";
        }
        if (backupReport != null && backupReport.failedBackups() > 0) {
            return "attention";
        }
        if (state != null && AutarkOsStates.SnapshotState.ERROR.equals(state.refreshStatus())) {
            return "attention";
        }
        return "healthy";
    }

    private static Double diskUsagePercent(File root) {
        long total = root.getTotalSpace();
        if (total <= 0) {
            return null;
        }
        long usable = root.getUsableSpace();
        return percent(total - usable, total);
    }

    private static Double memoryUsagePercent() {
        java.lang.management.OperatingSystemMXBean base = ManagementFactory.getOperatingSystemMXBean();
        if (!(base instanceof com.sun.management.OperatingSystemMXBean os)) {
            return null;
        }
        long total = os.getTotalMemorySize();
        if (total <= 0) {
            return null;
        }
        return percent(total - os.getFreeMemorySize(), total);
    }

    private static Double percent(long used, long total) {
        return Math.round(((double) used / (double) total) * 10_000.0) / 100.0;
    }

    private static <T> T safeGet(Supplier<T> supplier) {
        try {
            return supplier.get();
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static String firstPresent(String... values) {
        for (String value : values) {
            if (hasText(value)) {
                return value;
            }
        }
        return "";
    }
}

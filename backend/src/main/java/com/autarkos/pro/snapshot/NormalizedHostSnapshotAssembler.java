package com.autarkos.pro.snapshot;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.autarkos.access.AccessAppStatus;
import com.autarkos.access.AccessStatus;
import com.autarkos.activity.ActivityLog;
import com.autarkos.api.AutarkOsStates;
import com.autarkos.apps.AppOwnershipState;
import com.autarkos.apps.AppOwnershipView;
import com.autarkos.apps.ApplicationState;
import com.autarkos.backups.BackupModels;
import com.autarkos.backups.RestorePoint;
import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.marketplace.install.AppInstanceView;
import com.autarkos.marketplace.install.AppRuntimeView;
import com.autarkos.pro.model.NormalizedHostSnapshot;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.system.ProjectSettings;
import com.autarkos.system.ProjectVersionInfo;
import com.autarkos.system.StorageModels;
import com.autarkos.system.SystemMetrics;
import com.autarkos.system.SystemSetupModels;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public final class NormalizedHostSnapshotAssembler {

    static final int MAX_APPS = 128;
    static final int MAX_EVENTS = 100;
    static final int MAX_MUTATIONS = 32;
    static final int MAX_SERIALIZED_BYTES = 512 * 1024;
    static final Duration RECENT_WINDOW = Duration.ofDays(30);

    private static final String EMPTY_SNAPSHOT_ID =
            "00000000-0000-4000-8000-000000000000";
    private static final Set<String> EVENT_CATEGORIES = Set.of(
            "access",
            "app",
            "backup",
            "pro",
            "stability",
            "storage",
            "system");

    private final NormalizedHostSnapshotSource source;
    private final Supplier<Instant> clock;
    private final ObjectMapper objectMapper;

    @Autowired
    public NormalizedHostSnapshotAssembler(
            NormalizedHostSnapshotSource source) {
        this(
                source,
                Instant::now,
                new ObjectMapper().findAndRegisterModules());
    }

    NormalizedHostSnapshotAssembler(
            NormalizedHostSnapshotSource source,
            Supplier<Instant> clock,
            ObjectMapper objectMapper) {
        this.source = source;
        this.clock = clock;
        this.objectMapper = objectMapper;
    }

    public NormalizedHostSnapshot assemble() {
        return assemble(List.of());
    }

    public NormalizedHostSnapshot assemble(
            List<ProSnapshotMutation> origins) {
        Instant generatedAt = clock.get();
        PartialTracker partial = new PartialTracker();
        ProjectVersionInfo version =
                read(source::version, null, partial);
        ProjectSettings projectSettings =
                read(source::settings, null, partial);
        String agentVersion = read(
                source::agentVersion,
                "not-installed",
                partial);
        SystemSetupModels.SystemSetupStatus setup =
                read(source::setup, null, partial);
        ApplicationState applications =
                read(source::applications, null, partial);
        AccessStatus access = read(source::access, null, partial);
        BackupModels.BackupReport backups =
                read(source::backups, null, partial);
        StorageModels.StorageReport storage =
                read(source::storage, null, partial);
        SystemMetrics metrics = read(source::metrics, null, partial);
        List<AutarkOsJob> jobs =
                read(source::jobs, List.of(), partial);
        List<ActivityLog> activity =
                read(source::activity, null, partial);

        if (applications != null && applications.stale()) {
            partial.mark();
        }
        ResourceIndex resources = ResourceIndex.from(
                applications,
                resourceNamespace(version, setup),
                partial);
        List<AutarkOsJob> safeJobs =
                bounded(nonNull(jobs), 200, partial);
        List<ActivityLog> safeActivity =
                bounded(nonNull(activity), 200, partial);
        NormalizedHostSnapshot draft = new NormalizedHostSnapshot(
                "1",
                EMPTY_SNAPSHOT_ID,
                generatedAt,
                system(version, setup, access, metrics),
                apps(
                        applications,
                        resources,
                        safeJobs,
                        safeActivity,
                        generatedAt,
                        partial),
                foundServices(applications),
                access(applications, access, resources, partial),
                backups(
                        backups,
                        resources,
                        safeJobs,
                        safeActivity,
                        activity != null,
                        generatedAt,
                        partial),
                storage(
                        storage,
                        resources,
                        partial),
                metrics(metrics),
                configurationValues(
                        version,
                        agentVersion,
                        projectSettings,
                        applications,
                        backups,
                        resources),
                mutations(origins, generatedAt, partial),
                events(
                        safeJobs,
                        safeActivity,
                        resources,
                        generatedAt,
                        partial),
                partial.value());
        NormalizedHostSnapshot snapshot = withSnapshotId(
                draft,
                deterministicId(draft));
        requireBounded(snapshot);
        return snapshot;
    }

    private NormalizedHostSnapshot.SystemSnapshot system(
            ProjectVersionInfo version,
            SystemSetupModels.SystemSetupStatus setup,
            AccessStatus access,
            SystemMetrics metrics) {
        return new NormalizedHostSnapshot.SystemSnapshot(
                semver(version == null ? null : version.version()),
                architecture(metrics == null
                        ? null
                        : metrics.osArchitecture()),
                setup == null
                        ? "unknown"
                        : availability(setup.status()),
                tailscaleAvailability(access));
    }

    private List<NormalizedHostSnapshot.AppSnapshot> apps(
            ApplicationState state,
            ResourceIndex resources,
            List<AutarkOsJob> jobs,
            List<ActivityLog> activity,
            Instant generatedAt,
            PartialTracker partial) {
        if (state == null || state.managedApps() == null) {
            return List.of();
        }
        Instant cutoff = generatedAt.minus(RECENT_WINDOW);
        Map<String, NormalizedHostSnapshot.AppSnapshot> unique =
                new TreeMap<>();
        for (AppInstanceView app : state.managedApps()) {
            String ref = resources.resolve(
                    app.appInstanceId(),
                    app.catalogAppId());
            if (ref == null) {
                partial.mark();
                continue;
            }
            unique.putIfAbsent(
                    ref,
                    new NormalizedHostSnapshot.AppSnapshot(
                            ref,
                            resources.label(ref),
                            lifecycle(app),
                            readiness(app),
                            null,
                            recentFailureCount(
                                    ref,
                                    jobs,
                                    activity,
                                    resources,
                                    cutoff),
                            repairCount(
                                    ref,
                                    activity,
                                    resources,
                                    cutoff),
                            jobConflict(
                                    ref,
                                    jobs,
                                    resources)));
        }
        return bounded(
                new ArrayList<>(unique.values()),
                MAX_APPS,
                partial);
    }

    private NormalizedHostSnapshot.FoundServicesSnapshot foundServices(
            ApplicationState state) {
        List<AppOwnershipView> views =
                state == null || state.ownershipViews() == null
                        ? List.of()
                        : state.ownershipViews();
        int found = countState(
                views,
                AppOwnershipState.FOUND_ON_SERVER);
        int pinned = countState(
                views,
                AppOwnershipState.PINNED_EXTERNAL);
        int recoverable = countState(
                views,
                AppOwnershipState.RECOVERABLE);
        int blocked = countState(
                views,
                AppOwnershipState.BLOCKED);
        Set<String> categories = new LinkedHashSet<>();
        if (countState(views, AppOwnershipState.MANAGED_ELSEWHERE) > 0) {
            categories.add("ownership_foreign");
        }
        if (blocked > 0) {
            categories.add("ownership_blocked");
        }
        if (countState(views, AppOwnershipState.FAILED_INSTALL) > 0) {
            categories.add("failed_install");
        }
        return new NormalizedHostSnapshot.FoundServicesSnapshot(
                found,
                pinned,
                recoverable,
                blocked,
                List.copyOf(categories));
    }

    private List<NormalizedHostSnapshot.AccessSnapshot> access(
            ApplicationState applications,
            AccessStatus status,
            ResourceIndex resources,
            PartialTracker partial) {
        Map<String, AccessAppStatus> accessByReference =
                new HashMap<>();
        if (status != null && status.apps() != null) {
            for (AccessAppStatus app : status.apps()) {
                String ref = resources.resolve(app.appInstanceId());
                if (ref != null) {
                    accessByReference.put(ref, app);
                }
            }
        }
        Map<String, AppRuntimeView> runtimeByReference =
                new HashMap<>();
        if (applications != null && applications.runtimeApps() != null) {
            for (AppRuntimeView app : applications.runtimeApps()) {
                String ref = resources.resolve(app.appId());
                if (ref != null) {
                    runtimeByReference.put(ref, app);
                }
            }
        }
        List<NormalizedHostSnapshot.AccessSnapshot> result =
                new ArrayList<>();
        for (String ref : resources.references()) {
            AppRuntimeView runtime = runtimeByReference.get(ref);
            AccessAppStatus observed = accessByReference.get(ref);
            String intent = accessIntent(runtime);
            result.add(new NormalizedHostSnapshot.AccessSnapshot(
                    ref,
                    intent,
                    observed == null
                            ? "unknown"
                            : observed.serverCanReach()
                                    ? "available"
                                    : "unavailable",
                    mappingState(intent, runtime)));
        }
        return bounded(result, MAX_APPS, partial);
    }

    private NormalizedHostSnapshot.BackupSnapshot backups(
            BackupModels.BackupReport report,
            ResourceIndex resources,
            List<AutarkOsJob> jobs,
            List<ActivityLog> activity,
            boolean activityAvailable,
            Instant generatedAt,
            PartialTracker partial) {
        Map<String, BackupModels.AppBackupStatus> statusByReference =
                new HashMap<>();
        if (report != null && report.apps() != null) {
            for (BackupModels.AppBackupStatus app : report.apps()) {
                String ref = resources.resolve(app.appId());
                if (ref != null) {
                    statusByReference.put(ref, app);
                }
            }
        }
        List<NormalizedHostSnapshot.AppBackupSnapshot> apps =
                new ArrayList<>();
        for (String ref : resources.references()) {
            BackupModels.AppBackupStatus app =
                    statusByReference.get(ref);
            if (app == null) {
                apps.add(unknownBackup(ref));
                partial.mark();
                continue;
            }
            List<RestorePoint> restorePoints =
                    nonNull(app.restorePoints());
            Instant lastVerification = restorePoints.stream()
                    .map(RestorePoint::verifiedAt)
                    .filter(value -> value != null)
                    .max(Comparator.naturalOrder())
                    .orElse(null);
            apps.add(new NormalizedHostSnapshot.AppBackupSnapshot(
                    ref,
                    backupCoverage(app.status()),
                    scheduleState(app, report),
                    scheduleFrequency(app),
                    app.latestBackup() == null
                            ? null
                            : app.latestBackup().createdAt(),
                    lastVerification,
                    verificationResult(restorePoints),
                    recentBackupFailures(
                            restorePoints,
                            jobs,
                            ref,
                            resources,
                            generatedAt),
                    backupOperationState(
                            jobs,
                            ref,
                            resources),
                    restoreEvidence(
                            activity,
                            ref,
                            resources,
                            activityAvailable,
                            generatedAt),
                    lastSuccessfulRestore(
                            activity,
                            ref,
                            resources,
                            generatedAt),
                    app.retainedRestorePointCount()));
        }
        BackupModels.BackupDestination destination =
                report == null ? null : report.destination();
        return new NormalizedHostSnapshot.BackupSnapshot(
                report == null
                        ? "unknown"
                        : availability(report.status()),
                new NormalizedHostSnapshot.BackupDestinationSnapshot(
                        configuredDestination(destination)
                                ? "backup-destination:primary"
                                : null,
                        destinationAvailability(destination)),
                bounded(apps, MAX_APPS, partial));
    }

    private NormalizedHostSnapshot.StorageSnapshot storage(
            StorageModels.StorageReport report,
            ResourceIndex resources,
            PartialTracker partial) {
        StorageModels.StorageUsage host =
                report == null ? null : report.hostDisk();
        Long totalBytes = validCapacity(host == null
                ? 0
                : host.totalBytes());
        Long usedBytes = validCapacity(host == null
                ? 0
                : host.usedBytes());
        Long appDataBytes = report == null
                || report.apps() == null
                        ? null
                        : report.apps().stream()
                                .mapToLong(
                                        StorageModels.AppStorageUsage
                                                ::usedBytes)
                                .filter(value -> value >= 0)
                                .sum();
        StorageModels.StorageUsage backup =
                report == null ? null : report.backupStorage();
        Long backupTotalBytes = validCapacity(
                backup == null ? 0 : backup.totalBytes());
        Long backupVolumeUsedBytes = backup == null
                ? null
                : nonNegative(backup.usedBytes());
        // Volume usage includes filesystem overhead and unrelated data. Do not
        // present it as the size of backup data when CE has no authoritative
        // raw measurement for that value.
        Long backupUsedBytes = null;
        Map<String, StorageModels.AppStorageUsage> usageByReference =
                new HashMap<>();
        if (report != null && report.apps() != null) {
            for (StorageModels.AppStorageUsage app : report.apps()) {
                String ref = resources.resolve(app.appId());
                if (ref != null) {
                    usageByReference.put(ref, app);
                }
            }
        }
        List<NormalizedHostSnapshot.AppStorageSnapshot> apps =
                new ArrayList<>();
        for (String ref : resources.references()) {
            StorageModels.AppStorageUsage usage =
                    usageByReference.get(ref);
            apps.add(new NormalizedHostSnapshot.AppStorageSnapshot(
                    ref,
                    usage == null ? null : nonNegative(usage.usedBytes())));
            if (usage == null) {
                partial.mark();
            }
        }
        Long orphanBytes = report == null
                || report.orphanedData() == null
                        ? null
                        : sumOrphans(report.orphanedData());
        String availability = totalBytes != null
                && usedBytes != null
                        ? "available"
                        : "unknown";
        return new NormalizedHostSnapshot.StorageSnapshot(
                availability,
                totalBytes,
                usedBytes,
                appDataBytes,
                backupTotalBytes,
                backupVolumeUsedBytes,
                backupUsedBytes,
                bounded(apps, MAX_APPS, partial),
                orphanBytes);
    }

    private NormalizedHostSnapshot.MetricsSnapshot metrics(
            SystemMetrics metrics) {
        Double cpu = percent(metrics == null
                ? -1
                : metrics.systemCpuPercent());
        Double memory = percent(metrics == null
                ? -1
                : metrics.usedMemoryPercent());
        Double disk = percent(metrics == null
                ? -1
                : metrics.runtimeUsedPercent());
        return new NormalizedHostSnapshot.MetricsSnapshot(
                cpu == null && memory == null && disk == null
                        ? "unknown"
                        : cpu != null && memory != null && disk != null
                                ? "available"
                                : "degraded",
                cpu,
                memory,
                disk);
    }

    private List<NormalizedHostSnapshot.EventSnapshot> events(
            List<AutarkOsJob> jobs,
            List<ActivityLog> activity,
            ResourceIndex resources,
            Instant generatedAt,
            PartialTracker partial) {
        Instant cutoff = generatedAt.minus(RECENT_WINDOW);
        List<NormalizedHostSnapshot.EventSnapshot> events =
                new ArrayList<>();
        for (AutarkOsJob job : jobs) {
            if (job == null
                    || job.updatedAt() == null
                    || job.updatedAt().isBefore(cutoff)) {
                continue;
            }
            events.add(new NormalizedHostSnapshot.EventSnapshot(
                    jobCategory(job.type()),
                    eventOutcome(job.status()),
                    job.updatedAt(),
                    correlation(job.jobId()),
                    resources.resolveJobSubject(job)));
        }
        for (ActivityLog item : activity) {
            if (item == null
                    || item.createdAt() == null
                    || item.createdAt().isBefore(cutoff)
                    || "api".equals(item.category())) {
                continue;
            }
            events.add(new NormalizedHostSnapshot.EventSnapshot(
                    eventCategory(item.category()),
                    eventOutcome(item.outcome()),
                    item.createdAt(),
                    null,
                    resources.resolve(item.appId())));
        }
        events.sort(
                Comparator.comparing(
                                NormalizedHostSnapshot.EventSnapshot
                                        ::observedAt)
                        .reversed()
                        .thenComparing(
                                NormalizedHostSnapshot.EventSnapshot
                                        ::category)
                        .thenComparing(
                                event -> event.correlationId() == null
                                        ? ""
                                        : event.correlationId()));
        return bounded(events, MAX_EVENTS, partial);
    }

    private List<NormalizedHostSnapshot.ConfigurationSnapshot>
            configurationValues(
            ProjectVersionInfo version,
            String agentVersion,
            ProjectSettings settings,
            ApplicationState applications,
            BackupModels.BackupReport backups,
            ResourceIndex resources) {
        List<NormalizedHostSnapshot.ConfigurationSnapshot> values =
                new ArrayList<>();
        values.add(configuration(
                "core.version",
                null,
                semver(version == null ? null : version.version())));
        values.add(configuration(
                "agent.version",
                null,
                configurationVersion(agentVersion)));
        if (settings != null) {
            values.add(configuration(
                    "defaults.access",
                    null,
                    tokenOrUnknown(settings.defaultInstallAccess())));
            values.add(configuration(
                    "defaults.auto-repair",
                    null,
                    Boolean.toString(
                            settings.automaticRepairEnabled())));
            values.add(configuration(
                    "backups.enabled",
                    null,
                    Boolean.toString(
                            settings.automaticBackupsEnabled())));
            values.add(configuration(
                    "backups.frequency",
                    null,
                    tokenOrUnknown(settings.backupFrequency())));
            values.add(configuration(
                    "backups.retention",
                    null,
                    Integer.toString(
                            settings.backupRetentionDays())));
        }
        values.add(configuration(
                "backups.destination",
                null,
                destinationIdentity(
                        backups == null
                                ? null
                                : backups.destination())));

        Map<String, AppRuntimeView> runtimeByReference =
                new TreeMap<>();
        if (applications != null
                && applications.runtimeApps() != null) {
            for (AppRuntimeView runtime :
                    nonNull(applications.runtimeApps())) {
                String ref = resources.resolve(runtime.appId());
                if (ref != null) {
                    runtimeByReference.putIfAbsent(ref, runtime);
                }
            }
        }
        if (applications == null
                || applications.managedApps() == null) {
            return List.copyOf(values);
        }
        for (AppInstanceView app :
                nonNull(applications.managedApps())) {
            String ref = resources.resolve(
                    app.appInstanceId(),
                    app.catalogAppId());
            if (ref == null) {
                continue;
            }
            AppRuntimeView runtime = runtimeByReference.get(ref);
            values.add(configuration(
                    "app.image",
                    ref,
                    opaqueIdentity(
                            "image",
                            runtime == null
                                    ? null
                                    : runtime.image())));
            values.add(configuration(
                    "app.version",
                    ref,
                    configurationVersion(
                            runtime == null
                                    ? null
                                    : runtime.version())));
            values.add(configuration(
                    "app.enabled",
                    ref,
                    Boolean.toString(!Set.of(
                                    "paused",
                                    "stopped")
                            .contains(lifecycle(app)))));
            InstallModels.InstallSettings appSettings =
                    runtime == null ? null : runtime.settings();
            if (appSettings == null) {
                continue;
            }
            values.add(configuration(
                    "app.auto-repair",
                    ref,
                    Boolean.toString(
                            appSettings.autoRepairEnabled())));
            values.add(configuration(
                    "access.mode",
                    ref,
                    tokenOrUnknown(
                            appSettings.desiredAccessMode())));
            values.add(configuration(
                    "access.local-port",
                    ref,
                    port(appSettings.expectedLocalPort())));
            values.add(configuration(
                    "access.protocol",
                    ref,
                    tokenOrUnknown(
                            appSettings.expectedProtocol())));
            values.add(configuration(
                    "access.private-requirement",
                    ref,
                    tokenOrUnknown(
                            appSettings
                                    .privateAccessRequirement())));
            values.add(configuration(
                    "access.tailscale",
                    ref,
                    Boolean.toString(
                            appSettings.tailscaleEnabled())));
            InstallModels.BackupPolicy policy =
                    appSettings.backup();
            if (policy != null) {
                values.add(configuration(
                        "backup.enabled",
                        ref,
                        Boolean.toString(policy.enabled())));
                values.add(configuration(
                        "backup.frequency",
                        ref,
                        tokenOrUnknown(policy.frequency())));
                values.add(configuration(
                        "backup.retention",
                        ref,
                        Integer.toString(policy.retention())));
            }
        }
        return List.copyOf(values);
    }

    private NormalizedHostSnapshot.ConfigurationSnapshot configuration(
            String fieldId,
            String resourceRef,
            String value) {
        return new NormalizedHostSnapshot.ConfigurationSnapshot(
                fieldId,
                resourceRef,
                value);
    }

    private List<NormalizedHostSnapshot.MutationSnapshot> mutations(
            List<ProSnapshotMutation> source,
            Instant generatedAt,
            PartialTracker partial) {
        List<NormalizedHostSnapshot.MutationSnapshot> result =
                new ArrayList<>();
        Instant cutoff = generatedAt.minus(RECENT_WINDOW);
        for (ProSnapshotMutation mutation : nonNull(source)) {
            if (mutation.observedAt() == null
                    || mutation.observedAt().isBefore(cutoff)
                    || mutation.observedAt().isAfter(
                            generatedAt.plusSeconds(30))) {
                partial.mark();
                continue;
            }
            String method = cleanToken(mutation.method())
                    .toUpperCase(Locale.ROOT);
            String path = mutation.path() == null
                    ? ""
                    : mutation.path().trim();
            if (!Set.of("POST", "PUT", "PATCH", "DELETE")
                            .contains(method)
                    || !path.startsWith("/api/")
                    || path.length() > 256) {
                partial.mark();
                continue;
            }
            result.add(new NormalizedHostSnapshot.MutationSnapshot(
                    method,
                    path,
                    mutation.observedAt(),
                    correlation(mutation.correlationId())));
        }
        result.sort(Comparator.comparing(
                        NormalizedHostSnapshot.MutationSnapshot::observedAt)
                .reversed());
        return bounded(result, MAX_MUTATIONS, partial);
    }

    private String configurationVersion(String value) {
        if (value == null || value.isBlank()) {
            return "not-installed";
        }
        String cleaned = value.trim();
        if (cleaned.matches(
                "^[0-9]+\\.[0-9]+\\.[0-9]+"
                        + "(?:-[0-9A-Za-z.-]+)?"
                        + "(?:\\+[0-9A-Za-z.-]+)?$")
                && cleaned.length() <= 128) {
            return cleaned;
        }
        return opaqueIdentity("version", cleaned);
    }

    private String destinationIdentity(
            BackupModels.BackupDestination destination) {
        if (!configuredDestination(destination)) {
            return "not-configured";
        }
        return opaqueIdentity(
                "destination",
                Objects.toString(destination.kind(), "unknown")
                        + "\u0000"
                        + Objects.toString(
                                destination.deviceIdentity(),
                                "unknown"));
    }

    private String opaqueIdentity(
            String kind,
            String value) {
        if (value == null || value.isBlank()) {
            return "unknown";
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(("autark-pro-configuration-v1\u0000"
                            + kind
                            + "\u0000"
                            + value).getBytes(
                                    StandardCharsets.UTF_8));
            return kind
                    + ":"
                    + HexFormat.of().formatHex(digest, 0, 12);
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Configuration identity could not be normalized.");
        }
    }

    private String tokenOrUnknown(String value) {
        String token = cleanToken(value);
        return token.isBlank() ? "unknown" : token;
    }

    private String port(Integer value) {
        return value != null && value > 0 && value <= 65_535
                ? Integer.toString(value)
                : "unknown";
    }

    private NormalizedHostSnapshot withSnapshotId(
            NormalizedHostSnapshot source,
            String snapshotId) {
        return new NormalizedHostSnapshot(
                source.schemaVersion(),
                snapshotId,
                source.generatedAt(),
                source.system(),
                source.apps(),
                source.foundServices(),
                source.access(),
                source.backups(),
                source.storage(),
                source.metrics(),
                source.configuration(),
                source.recentMutations(),
                source.recentEvents(),
                source.partial());
    }

    private String deterministicId(NormalizedHostSnapshot snapshot) {
        try {
            byte[] canonical = objectMapper.writeValueAsBytes(snapshot);
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(canonical);
            digest[6] = (byte) ((digest[6] & 0x0f) | 0x40);
            digest[8] = (byte) ((digest[8] & 0x3f) | 0x80);
            ByteBuffer bytes = ByteBuffer.wrap(digest);
            return new UUID(
                    bytes.getLong(),
                    bytes.getLong()).toString();
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Autark Pro could not identify the normalized snapshot.",
                    exception);
        }
    }

    private void requireBounded(NormalizedHostSnapshot snapshot) {
        try {
            if (objectMapper.writeValueAsBytes(snapshot).length
                    > MAX_SERIALIZED_BYTES) {
                throw new IllegalStateException(
                        "Autark Pro normalized snapshot exceeds its size limit.");
            }
        } catch (IllegalStateException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Autark Pro could not serialize the normalized snapshot.",
                    exception);
        }
    }

    private NormalizedHostSnapshot.AppBackupSnapshot unknownBackup(
            String resourceRef) {
        return new NormalizedHostSnapshot.AppBackupSnapshot(
                resourceRef,
                "unknown",
                "unknown",
                "unknown",
                null,
                null,
                "unknown",
                0,
                "unknown",
                "unknown",
                null,
                null);
    }

    private String backupCoverage(String status) {
        return switch (cleanToken(status)) {
            case "protected", "not_backed_up", "failed" -> "included";
            case "unprotected" -> "excluded-intentionally";
            case "recovery_limited" -> "missing";
            default -> "unknown";
        };
    }

    private String scheduleState(
            BackupModels.AppBackupStatus app,
            BackupModels.BackupReport report) {
        if ("unprotected".equals(cleanToken(app.status()))) {
            return "disabled";
        }
        if (report.settings() == null) {
            return "unknown";
        }
        return report.settings().automaticBackupsEnabled()
                ? "configured"
                : "disabled";
    }

    private String scheduleFrequency(
            BackupModels.AppBackupStatus app) {
        String frequency = cleanToken(app.backupFrequency());
        return Set.of("hourly", "daily", "weekly")
                        .contains(frequency)
                ? frequency
                : "unknown";
    }

    private String verificationResult(
            List<RestorePoint> restorePoints) {
        if (restorePoints.isEmpty()) {
            return "not-run";
        }
        return restorePoints.stream()
                .filter(point -> point.verifiedAt() != null)
                .max(Comparator.comparing(RestorePoint::verifiedAt))
                .map(point -> {
                    if (AutarkOsStates.RestorePointStatus.VERIFIED
                            .equals(point.verificationStatus())) {
                        return "passed";
                    }
                    if (AutarkOsStates.RestorePointStatus.FAILED
                            .equals(point.verificationStatus())) {
                        return "failed";
                    }
                    return "unknown";
                })
                .orElse("not-run");
    }

    private int recentBackupFailures(
            List<RestorePoint> restorePoints,
            List<AutarkOsJob> jobs,
            String resourceRef,
            ResourceIndex resources,
            Instant generatedAt) {
        Instant cutoff = generatedAt.minus(RECENT_WINDOW);
        long restorePointFailures = restorePoints.stream()
                .filter(point -> point.createdAt() != null
                        && !point.createdAt().isBefore(cutoff))
                .filter(point ->
                        AutarkOsStates.RestorePointStatus.FAILED
                                .equals(point.status())
                                || AutarkOsStates.RestorePointStatus.FAILED
                                        .equals(
                                                point.verificationStatus()))
                .count();
        long jobFailures = jobs.stream()
                .filter(job -> backupJob(job)
                        && resources.jobAppliesTo(
                                job,
                                resourceRef)
                        && job.createdAt() != null
                        && !job.createdAt().isBefore(cutoff)
                        && (AutarkOsStates.JobStatus.FAILED
                                        .equals(job.status())
                                || AutarkOsStates.JobStatus.CANCELLED
                                        .equals(job.status())
                                || AutarkOsStates.JobStatus.CANCELED
                                        .equals(job.status())))
                .count();
        return boundedCount(Math.max(
                restorePointFailures,
                jobFailures));
    }

    private String backupOperationState(
            List<AutarkOsJob> jobs,
            String resourceRef,
            ResourceIndex resources) {
        List<AutarkOsJob> active = jobs.stream()
                .filter(job -> job != null
                        && (AutarkOsStates.JobStatus.QUEUED
                                        .equals(job.status())
                                || AutarkOsStates.JobStatus.RUNNING
                                        .equals(job.status())))
                .filter(job -> resources.jobAppliesTo(
                        job,
                        resourceRef))
                .toList();
        if (active.stream().anyMatch(job ->
                !backupJob(job))) {
            return "blocked";
        }
        return active.isEmpty() ? "idle" : "active";
    }

    private boolean backupJob(AutarkOsJob job) {
        if (job == null) {
            return false;
        }
        return Set.of(
                        AutarkOsStates.JobType.BACKUP,
                        AutarkOsStates.JobType.BACKUP_VERIFY,
                        AutarkOsStates.JobType.BACKUP_RESTORE)
                .contains(cleanToken(job.type()));
    }

    private String restoreEvidence(
            List<ActivityLog> activity,
            String resourceRef,
            ResourceIndex resources,
            boolean activityAvailable,
            Instant generatedAt) {
        if (!activityAvailable) {
            return "unknown";
        }
        return lastSuccessfulRestore(
                        activity,
                        resourceRef,
                        resources,
                        generatedAt)
                        == null
                ? "not-observed"
                : "observed";
    }

    private Instant lastSuccessfulRestore(
            List<ActivityLog> activity,
            String resourceRef,
            ResourceIndex resources,
            Instant generatedAt) {
        Instant cutoff = generatedAt.minus(RECENT_WINDOW);
        return activity.stream()
                .filter(item -> item != null
                        && item.createdAt() != null
                        && !item.createdAt().isBefore(cutoff)
                        && "backup".equals(
                                eventCategory(item.category()))
                        && Set.of(
                                        "restore_app",
                                        "restore_completed")
                                .contains(
                                        cleanToken(item.action()))
                        && "completed".equals(
                                eventOutcome(item.outcome()))
                        && resourceRef.equals(
                                resources.resolve(item.appId())))
                .map(ActivityLog::createdAt)
                .max(Comparator.naturalOrder())
                .orElse(null);
    }

    private String destinationAvailability(
            BackupModels.BackupDestination destination) {
        if (destination == null) {
            return "unknown";
        }
        if (destination.ready()) {
            return "available";
        }
        return configuredDestination(destination)
                ? "degraded"
                : "unavailable";
    }

    private boolean configuredDestination(
            BackupModels.BackupDestination destination) {
        return destination != null
                && ((destination.configuredPath() != null
                                && !destination.configuredPath().isBlank())
                        || (destination.kind() != null
                                && !destination.kind().isBlank()
                                && !"unconfigured".equals(
                                        destination.kind())));
    }

    private String accessIntent(AppRuntimeView runtime) {
        String mode = runtime == null || runtime.desiredAccess() == null
                ? ""
                : cleanToken(runtime.desiredAccess().mode());
        return switch (mode) {
            case "local", "lan", "lan_only" -> "lan";
            case "private", "private_lan" -> "private";
            case "server_only" -> "server-only";
            case "public" -> "public";
            default -> "unknown";
        };
    }

    private String mappingState(
            String intent,
            AppRuntimeView runtime) {
        if (!"private".equals(intent)) {
            return "not-applicable";
        }
        if (runtime == null || runtime.observedAccess() == null) {
            return "unknown";
        }
        return switch (cleanToken(
                runtime.observedAccess().privateLinkStatus())) {
            case "ready", "verified", "current" -> "current";
            case "waiting", "missing", "not_configured" -> "missing";
            case "not_enabled" -> "not-applicable";
            case "" -> "unknown";
            default -> "stale";
        };
    }

    private String tailscaleAvailability(AccessStatus access) {
        if (access == null || access.tailscale() == null) {
            return "unknown";
        }
        if ("mock".equals(access.tailscale().mode())) {
            return "unknown";
        }
        if (access.tailscale().signedIn()
                && access.tailscale().magicDnsReady()
                && access.tailscale().httpsReady()) {
            return access.tailscale().serveReady()
                    ? "available"
                    : "degraded";
        }
        if (access.tailscale().installed()) {
            return "degraded";
        }
        return "unavailable";
    }

    private int recentFailureCount(
            String resourceRef,
            List<AutarkOsJob> jobs,
            List<ActivityLog> activity,
            ResourceIndex resources,
            Instant cutoff) {
        long jobFailures = jobs.stream()
                .filter(job -> job != null
                        && job.updatedAt() != null
                        && !job.updatedAt().isBefore(cutoff)
                        && AutarkOsStates.JobStatus.FAILED
                                .equals(job.status())
                        && resourceRef.equals(
                                resources.resolveJobSubject(job)))
                .count();
        long activityFailures = activity.stream()
                .filter(item -> item != null
                        && item.createdAt() != null
                        && !item.createdAt().isBefore(cutoff)
                        && ("failed".equals(item.outcome())
                                || "error".equals(item.level()))
                        && resourceRef.equals(
                                resources.resolve(item.appId())))
                .count();
        return boundedCount(jobFailures + activityFailures);
    }

    private int repairCount(
            String resourceRef,
            List<ActivityLog> activity,
            ResourceIndex resources,
            Instant cutoff) {
        return boundedCount(activity.stream()
                .filter(item -> item != null
                        && item.createdAt() != null
                        && !item.createdAt().isBefore(cutoff)
                        && cleanToken(item.action()).contains("repair")
                        && resourceRef.equals(
                                resources.resolve(item.appId())))
                .count());
    }

    private String jobConflict(
            String resourceRef,
            List<AutarkOsJob> jobs,
            ResourceIndex resources) {
        return jobs.stream()
                .filter(job -> job != null
                        && (AutarkOsStates.JobStatus.QUEUED
                                        .equals(job.status())
                                || AutarkOsStates.JobStatus.RUNNING
                                        .equals(job.status())))
                .filter(job -> resources.jobAppliesTo(
                        job,
                        resourceRef))
                .sorted(Comparator.comparing(
                        job -> job.createdAt() == null
                                ? Instant.EPOCH
                                : job.createdAt()))
                .map(job -> {
                    String type = cleanToken(job.type());
                    return type.matches(
                            "^[a-z][a-z0-9_]{0,63}$")
                                    ? type
                                    : "other_job";
                })
                .findFirst()
                .orElse(null);
    }

    private String lifecycle(AppInstanceView app) {
        return switch (cleanToken(app.userStatus())) {
            case "ready", "installed" -> "running";
            case "starting" -> "starting";
            case "paused" -> "paused";
            case "stopped" -> "stopped";
            case "missing", "needs_attention", "unavailable" -> "failed";
            default -> "unknown";
        };
    }

    private String readiness(AppInstanceView app) {
        return switch (cleanToken(app.readinessState())) {
            case "ready", "reachable" -> "available";
            case "starting", "degraded" -> "degraded";
            case "paused", "stopped", "unreachable", "missing" ->
                "unavailable";
            default -> "unknown";
        };
    }

    private String eventCategory(String value) {
        String normalized = cleanToken(value);
        return EVENT_CATEGORIES.contains(normalized)
                ? normalized
                : "system";
    }

    private String jobCategory(String type) {
        String normalized = cleanToken(type);
        if (normalized.contains("backup")
                || normalized.contains("restore")) {
            return "backup";
        }
        if (normalized.startsWith("pro_")) {
            return "pro";
        }
        return normalized.contains("app")
                || normalized.contains("install")
                || normalized.contains("repair")
                || normalized.contains("update")
                        ? "app"
                        : "system";
    }

    private String eventOutcome(String value) {
        return switch (cleanToken(value)) {
            case "succeeded", "completed" -> "completed";
            case "failed", "error", "cancelled", "canceled" -> "failed";
            case "warning", "needs_attention" -> "needs_attention";
            default -> "unknown";
        };
    }

    private String correlation(String value) {
        if (value == null
                || !value.matches("^[A-Za-z0-9._-]{1,128}$")) {
            return null;
        }
        return value;
    }

    private String availability(String value) {
        return switch (cleanToken(value)) {
            case "available", "healthy", "ok", "ready" -> "available";
            case "degraded", "warning", "needs_attention" -> "degraded";
            case "error", "failed", "unavailable", "blocked" ->
                "unavailable";
            default -> "unknown";
        };
    }

    private String semver(String value) {
        String normalized = value == null ? "" : value.trim();
        return normalized.matches(
                "^[0-9]+\\.[0-9]+\\.[0-9]+"
                        + "(?:-[0-9A-Za-z.-]+)?"
                        + "(?:\\+[0-9A-Za-z.-]+)?$")
                && normalized.length() <= 128
                        ? normalized
                        : "0.0.0-dev";
    }

    private String architecture(String value) {
        return switch (value == null
                ? ""
                : value.trim().toLowerCase(Locale.ROOT)) {
            case "amd64", "x86_64", "linux/amd64" -> "linux/amd64";
            case "arm64", "aarch64", "linux/arm64" -> "linux/arm64";
            default -> "linux/amd64";
        };
    }

    private String resourceNamespace(
            ProjectVersionInfo version,
            SystemSetupModels.SystemSetupStatus setup) {
        if (version != null
                && version.instanceId() != null
                && !version.instanceId().isBlank()) {
            return version.instanceId();
        }
        if (setup != null
                && setup.instanceId() != null
                && !setup.instanceId().isBlank()) {
            return setup.instanceId();
        }
        return "unavailable";
    }

    private Double percent(double value) {
        if (!Double.isFinite(value)
                || value < 0
                || value > 100) {
            return null;
        }
        return Math.round(value * 100.0) / 100.0;
    }

    private Long validCapacity(long value) {
        return value > 0 ? value : null;
    }

    private Long validCapacity(Long value) {
        return value != null && value > 0 ? value : null;
    }

    private Long nonNegative(long value) {
        return value >= 0 ? value : null;
    }

    private Long nonNegative(Long value) {
        return value != null && value >= 0 ? value : null;
    }

    private long sumOrphans(
            List<StorageModels.OrphanedStorage> values) {
        long total = 0;
        for (StorageModels.OrphanedStorage value : values) {
            if (value == null || value.usedBytes() < 0) {
                continue;
            }
            if (Long.MAX_VALUE - total < value.usedBytes()) {
                return Long.MAX_VALUE;
            }
            total += value.usedBytes();
        }
        return total;
    }

    private int countState(
            List<AppOwnershipView> views,
            AppOwnershipState state) {
        return boundedCount(views.stream()
                .filter(view -> view != null
                        && state == view.state())
                .count());
    }

    private int boundedCount(long value) {
        return (int) Math.min(Integer.MAX_VALUE, Math.max(0, value));
    }

    private String cleanToken(String value) {
        if (value == null) {
            return "";
        }
        return value.trim()
                .toLowerCase(Locale.ROOT)
                .replace('-', '_')
                .replace(' ', '_')
                .replaceAll("[^a-z0-9_]", "");
    }

    private <T> T read(
            Supplier<T> operation,
            T fallback,
            PartialTracker partial) {
        try {
            T value = operation.get();
            if (value == null) {
                partial.mark();
                return fallback;
            }
            return value;
        } catch (RuntimeException exception) {
            partial.mark();
            return fallback;
        }
    }

    private <T> List<T> nonNull(List<T> values) {
        return values == null
                ? List.of()
                : values.stream()
                        .filter(value -> value != null)
                        .toList();
    }

    private <T> List<T> bounded(
            List<T> values,
            int maximum,
            PartialTracker partial) {
        if (values.size() <= maximum) {
            return List.copyOf(values);
        }
        partial.mark();
        return List.copyOf(values.subList(0, maximum));
    }

    private static final class PartialTracker {

        private boolean partial;

        void mark() {
            partial = true;
        }

        boolean value() {
            return partial;
        }
    }

    private static final class ResourceIndex {

        private static final String HASH_DOMAIN =
                "autark-pro-resource-v1\u0000";

        private final Map<String, String> byRawId =
                new HashMap<>();
        private final Map<String, String> labelsByReference =
                new TreeMap<>();

        static ResourceIndex from(
                ApplicationState applications,
                String namespace,
                PartialTracker partial) {
            ResourceIndex result = new ResourceIndex();
            if (applications == null
                    || applications.managedApps() == null) {
                return result;
            }
            for (AppInstanceView app : applications.managedApps()) {
                String raw = firstText(
                        app.appInstanceId(),
                        app.catalogAppId());
                if (raw == null) {
                    partial.mark();
                    continue;
                }
                String ref = "app:" + hash(namespace, raw);
                result.labelsByReference.putIfAbsent(
                        ref,
                        safeDisplayName(app.catalogAppId()));
                result.add(raw, ref);
                result.add(app.appInstanceId(), ref);
                result.add(app.catalogAppId(), ref);
            }
            return result;
        }

        String resolve(String... values) {
            for (String value : values) {
                if (value != null && byRawId.containsKey(value)) {
                    return byRawId.get(value);
                }
            }
            return null;
        }

        String label(String reference) {
            return labelsByReference.getOrDefault(
                    reference,
                    "Managed app");
        }

        List<String> references() {
            return List.copyOf(labelsByReference.keySet());
        }

        String resolveJobSubject(AutarkOsJob job) {
            if (job == null || job.subjectId() == null) {
                return null;
            }
            String subject = job.subjectId();
            if (AutarkOsStates.JobType.BACKUP_RESTORE
                    .equals(job.type())) {
                int separator = subject.indexOf(':');
                subject = separator < 0
                        ? subject
                        : subject.substring(separator + 1);
                if ("all".equals(subject)) {
                    return null;
                }
            }
            return resolve(subject);
        }

        boolean jobAppliesTo(
                AutarkOsJob job,
                String resourceRef) {
            if (job == null || job.subjectId() == null) {
                return false;
            }
            if (AutarkOsStates.JobType.BACKUP_RESTORE
                    .equals(job.type())) {
                String subject = job.subjectId();
                int separator = subject.indexOf(':');
                String target = separator < 0
                        ? subject
                        : subject.substring(separator + 1);
                if ("all".equals(target)) {
                    return true;
                }
            }
            return resourceRef.equals(resolveJobSubject(job));
        }

        private void add(String raw, String ref) {
            if (raw != null && !raw.isBlank()) {
                byRawId.putIfAbsent(raw, ref);
            }
        }

        private static String hash(
                String namespace,
                String value) {
            try {
                byte[] digest = MessageDigest.getInstance("SHA-256")
                        .digest((HASH_DOMAIN
                                + namespace
                                + "\u0000"
                                + value)
                                .getBytes(StandardCharsets.UTF_8));
                return HexFormat.of().formatHex(digest, 0, 12);
            } catch (Exception exception) {
                throw new IllegalStateException(
                        "Autark Pro could not normalize a local resource.",
                        exception);
            }
        }

        private static String firstText(String... values) {
            for (String value : values) {
                if (value != null && !value.isBlank()) {
                    return value;
                }
            }
            return null;
        }

        private static String safeDisplayName(String value) {
            if (value == null
                    || !value.matches(
                            "^[a-z0-9][a-z0-9-]{0,63}$")) {
                return "Managed app";
            }
            return java.util.Arrays.stream(
                            value.split("-"))
                    .filter(part -> !part.isBlank())
                    .map(part ->
                            Character.toUpperCase(
                                            part.charAt(0))
                                    + part.substring(1))
                    .collect(
                            java.util.stream.Collectors.joining(
                                    " "));
        }
    }
}

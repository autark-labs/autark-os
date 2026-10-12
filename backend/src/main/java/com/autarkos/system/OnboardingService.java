package com.autarkos.system;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.backups.BackupDestinationService;

@Service
public class OnboardingService {

    private static final List<String> DEFAULT_RECOMMENDED_APPS = BetaScope.CURRENT.apps().stream()
            .filter(BetaScope.App::starter).map(BetaScope.App::id).toList();

    private final ProjectSettingsRepository settingsRepository;
    private final ProjectSettingsService settingsService;
    private final RuntimeLayout runtimeLayout;
    private final TailscaleService tailscaleService;
    private final SystemDoctorService doctorService;
    private final BackupDestinationService backupDestinationService;

    public OnboardingService(ProjectSettingsRepository settingsRepository, ProjectSettingsService settingsService, RuntimeLayout runtimeLayout, TailscaleService tailscaleService, SystemDoctorService doctorService) {
        this(settingsRepository, settingsService, runtimeLayout, tailscaleService, doctorService, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public OnboardingService(ProjectSettingsRepository settingsRepository, ProjectSettingsService settingsService, RuntimeLayout runtimeLayout, TailscaleService tailscaleService, SystemDoctorService doctorService, BackupDestinationService backupDestinationService) {
        this.settingsRepository = settingsRepository;
        this.settingsService = settingsService;
        this.runtimeLayout = runtimeLayout;
        this.tailscaleService = tailscaleService;
        this.doctorService = doctorService;
        this.backupDestinationService = backupDestinationService;
    }

    public OnboardingModels.OnboardingState state() {
        return state(settingsRepository.readAll(), tailscaleConnected(), doctorService.status());
    }

    boolean tailscaleConnected() { return tailscaleService.status().connected(); }

    private OnboardingModels.OnboardingState state(Map<String, String> values, boolean connected, SystemSetupModels.SystemDoctorStatus doctor) {
        ProjectSettings settings = settingsService.current();
        String destination = currentBackupDestination();
        return new OnboardingModels.OnboardingState(
                SetupCompletionState.onboardingStatus(values),
                intValue(values, "onboardingCurrentStep", 0),
                settings.deviceName(),
                runtimeLayout.runtimeRoot().toString(),
                destination,
                connected,
                value(values, "privateAccessChoice", connected ? "already-connected" : "local-only"),
                settings.automaticBackupsEnabled(),
                settings.backupFrequency(),
                listValue(values, "onboardingRecommendedApps", DEFAULT_RECOMMENDED_APPS).stream().filter(DEFAULT_RECOMMENDED_APPS::contains).toList(),
                listValue(values, "onboardingCompletedSteps", List.of()).stream()
                        .filter(step -> !"tailscale".equals(step) || connected).toList(),
                doctor,
                instantValue(values, "onboardingUpdatedAt"),
                value(values, "onboardingBackupPosture", !destination.equals(defaultBackupDestination().toString()) ? "external"
                        : settings.automaticBackupsEnabled() ? "routine" : "later"),
                BetaScope.CURRENT.apps().stream().filter(BetaScope.App::starter).toList());
    }

    @Transactional
    public OnboardingModels.OnboardingState update(OnboardingModels.OnboardingUpdateRequest request) {
        var savedValues = settingsRepository.readAll();
        if (SetupCompletionState.isComplete(savedValues)) return state();
        Map<String, String> updates = new LinkedHashMap<>();
        boolean finishRequested = "complete".equals(cleanStatus(request.status() == null ? "" : request.status()));
        if (request.status() != null && !request.status().isBlank()) {
            updates.put(SetupCompletionState.ONBOARDING_STATUS_KEY, finishRequested ? "in_progress" : cleanStatus(request.status()));
        }
        if (request.currentStep() != null) {
            updates.put("onboardingCurrentStep", Integer.toString(Math.max(0, Math.min(request.currentStep(), 6))));
        }
        String posture = request.backupPosture();
        if (posture != null && !List.of("routine", "external", "later").contains(posture)) {
            throw new InstallationException("Choose same-device backups, an external location, or configure later.");
        }
        String destination = request.backupDestination();
        if ("routine".equals(posture) || "later".equals(posture)) destination = defaultBackupDestination().toString();
        if ("external".equals(posture)) {
            if (destination == null) destination = currentBackupDestination();
            if (defaultBackupDestination().equals(Path.of(destination.trim()).toAbsolutePath().normalize())) {
                throw new InstallationException("Choose an external backup location or same-device backups.");
            }
        }
        if (destination != null) {
            String configuredDestination;
            if (backupDestinationService != null) configuredDestination = backupDestinationService.configure(destination).configuredPath();
            else {
                configuredDestination = cleanBackupDestination(destination);
                updates.put("backupDestination", configuredDestination);
            }
            if (posture == null) {
                boolean internal = defaultBackupDestination().toString().equals(configuredDestination);
                boolean unchangedLater = internal && "later".equals(savedValues.get("onboardingBackupPosture"))
                        && configuredDestination.equals(savedValues.getOrDefault("backupDestination", defaultBackupDestination().toString()));
                posture = unchangedLater ? "later" : internal ? "routine" : "external";
            }
        }
        if (posture != null) updates.put("onboardingBackupPosture", posture);
        if (request.privateAccessChoice() != null) {
            updates.put("privateAccessChoice", cleanPrivateAccessChoice(request.privateAccessChoice()));
        }
        if (request.recommendedApps() != null) {
            updates.put("onboardingRecommendedApps", encodeList(request.recommendedApps().stream().filter(DEFAULT_RECOMMENDED_APPS::contains).toList()));
        }
        if (request.completedSteps() != null) {
            updates.put("onboardingCompletedSteps", encodeList(request.completedSteps().stream()
                    .filter(step -> !"tailscale".equals(step)).toList()));
        }
        updates.put("onboardingUpdatedAt", Instant.now().toString());
        if (request.deviceName() != null || request.automaticBackupsEnabled() != null || "later".equals(posture)) {
            ProjectSettings current = settingsService.current();
            settingsService.update(new ProjectSettings(
                    request.deviceName() == null || request.deviceName().isBlank() ? current.deviceName() : request.deviceName().trim(),
                    current.timeZone(),
                    current.language(),
                    current.temperatureUnit(),
                    current.dateFormat(),
                    current.timeFormat(),
                    current.startOnBoot(),
                    current.telemetryEnabled(),
                    current.defaultInstallAccess(),
                    current.automaticRepairEnabled(),
                    "later".equals(posture) ? false : request.automaticBackupsEnabled() == null ? current.automaticBackupsEnabled() : request.automaticBackupsEnabled(),
                    current.backupFrequency(),
                    current.backupRetentionDays(),
                    current.backupTime(),
                    Instant.now()));
        }
        settingsRepository.saveValues(updates);
        return finishRequested ? complete(Boolean.TRUE.equals(request.acknowledgeOptionalWork())) : state();
    }

    @Transactional
    public OnboardingModels.OnboardingState complete() { return complete(false); }

    @Transactional
    public OnboardingModels.OnboardingState complete(boolean acknowledgeOptionalWork) {
        var values = settingsRepository.readAll();
        if (SetupCompletionState.isComplete(values)) return state();
        var doctor = doctorService.status();
        var readiness = doctor.readiness();
        if (!readiness.canCompleteOnboarding()) throw new InstallationException(readiness.summary());
        if (readiness.finishAnywayRequiresAdvanced() && !acknowledgeOptionalWork) {
            throw new InstallationException("Review and acknowledge the remaining optional setup work before finishing. " + readiness.summary());
        }
        boolean connected = tailscaleConnected();
        var completed = SetupCompletionState.steps(values.get(SetupCompletionState.PROGRESS_COMPLETED_KEY));
        var skipped = SetupCompletionState.steps(values.get("setupProgressSkippedSteps"));
        completed.addAll(List.of("welcome", "host_check", "access_choice", "starter_apps", "done"));
        if (doctor.checks().stream().anyMatch(check -> SystemCapabilityCatalog.DOCKER.equals(check.id()) && SystemCapabilityCatalog.OK.equals(check.status()))) completed.add("docker_check");
        else { completed.remove("docker_check"); skipped.add("docker_check"); }
        completed.remove("tailscale_connect");
        skipped.remove("tailscale_connect");
        if (connected) completed.add("tailscale_connect");
        else if ("local-only".equals(value(values, "privateAccessChoice", "local-only"))) skipped.add("tailscale_connect");
        if (!completed.contains("first_backup")) skipped.add("first_backup");
        skipped.removeAll(completed);
        var timestamp = Instant.now().toString();
        settingsRepository.saveValues(Map.of(
                SetupCompletionState.ONBOARDING_STATUS_KEY, "complete",
                SetupCompletionState.PROGRESS_COMPLETED_KEY, SetupCompletionState.encode(completed),
                "setupProgressSkippedSteps", SetupCompletionState.encode(skipped),
                SetupCompletionState.PROGRESS_UPDATED_KEY, timestamp,
                "onboardingCurrentStep", "6", "onboardingUpdatedAt", timestamp,
                "onboardingCompletedSteps", connected ? "device,doctor,tailscale,storage,backups,apps" : "device,doctor,storage,backups,apps"));
        return state(settingsRepository.readAll(), connected, doctor);
    }

    private String cleanStatus(String value) {
        return switch (value.trim().toLowerCase()) {
            case "in_progress", "complete" -> value.trim().toLowerCase();
            default -> "not_started";
        };
    }

    private String value(Map<String, String> values, String key, String fallback) {
        String value = values.get(key);
        return value == null || value.isBlank() ? fallback : value;
    }

    private int intValue(Map<String, String> values, String key, int fallback) {
        try {
            return Integer.parseInt(value(values, key, Integer.toString(fallback)));
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }

    private Instant instantValue(Map<String, String> values, String key) {
        String value = values.get(key);
        if (value == null || value.isBlank()) {
            return Instant.now();
        }
        return Instant.parse(value);
    }

    private List<String> listValue(Map<String, String> values, String key, List<String> fallback) {
        String value = values.get(key);
        if (value == null) {
            return fallback;
        }
        return Arrays.stream(value.split(",")).map(String::trim).filter(item -> !item.isBlank()).toList();
    }

    private String encodeList(List<String> values) {
        return values.stream().map(String::trim).filter(value -> !value.isBlank()).distinct().collect(java.util.stream.Collectors.joining(","));
    }

    private String cleanPrivateAccessChoice(String value) {
        return switch (value == null ? "" : value.trim().toLowerCase()) {
            case "setup-now", "local-only", "already-connected" -> value.trim().toLowerCase();
            default -> "local-only";
        };
    }

    private Path defaultBackupDestination() {
        return runtimeLayout.runtimeRoot().resolve("backups").toAbsolutePath().normalize();
    }

    private String currentBackupDestination() {
        if (backupDestinationService != null) {
            return backupDestinationService.current().configuredPath();
        }
        return settingsRepository.backupDestination(defaultBackupDestination()).toString();
    }

    private String cleanBackupDestination(String destination) {
        if (destination == null || destination.isBlank()) {
            throw new InstallationException("Choose a backup destination, or pick a different backup option.");
        }
        Path raw = Path.of(destination.trim());
        if (!raw.isAbsolute()) {
            throw new InstallationException("Backup destination must be an absolute path.");
        }
        Path normalized = raw.toAbsolutePath().normalize();
        if (normalized.getParent() == null || normalized.equals(Path.of("/")) || normalized.equals(Path.of("/tmp"))) {
            throw new InstallationException("Choose a dedicated backup folder instead of a system or temporary folder.");
        }
        try {
            if (Files.exists(normalized) && !Files.isDirectory(normalized)) {
                throw new InstallationException("Backup destination must be a folder.");
            }
            Path parent = Files.exists(normalized) ? normalized : normalized.getParent();
            if (parent == null || !Files.exists(parent) || !Files.isDirectory(parent)) {
                throw new InstallationException("The parent folder for the backup destination does not exist.");
            }
            if (!Files.isWritable(parent)) {
                throw new InstallationException("Autark-OS cannot write to the backup destination.");
            }
            Files.createDirectories(normalized);
            if (!Files.isWritable(normalized)) {
                throw new InstallationException("Autark-OS cannot write to the backup destination.");
            }
            return normalized.toString();
        } catch (IOException exception) {
            throw new InstallationException("Autark-OS could not prepare the backup destination.", exception);
        }
    }
}

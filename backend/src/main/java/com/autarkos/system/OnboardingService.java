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

import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.system.api.OnboardingState;
import com.autarkos.system.api.OnboardingUpdateRequest;

@Service
public class OnboardingService {

    private static final List<String> DEFAULT_RECOMMENDED_APPS = List.of("vaultwarden", "jellyfin", "homepage");

    private final ProjectSettingsRepository settingsRepository;
    private final ProjectSettingsService settingsService;
    private final RuntimeLayout runtimeLayout;
    private final TailscaleService tailscaleService;
    private final SystemDoctorService doctorService;

    public OnboardingService(ProjectSettingsRepository settingsRepository, ProjectSettingsService settingsService, RuntimeLayout runtimeLayout, TailscaleService tailscaleService, SystemDoctorService doctorService) {
        this.settingsRepository = settingsRepository;
        this.settingsService = settingsService;
        this.runtimeLayout = runtimeLayout;
        this.tailscaleService = tailscaleService;
        this.doctorService = doctorService;
    }

    public OnboardingState state() {
        boolean existingSettings = settingsRepository.hasAnySettings();
        Map<String, String> values = settingsRepository.readAll();
        ProjectSettings settings = settingsService.current();
        String defaultStatus = existingSettings ? "complete" : "not_started";
        return new OnboardingState(
                value(values, "onboardingStatus", defaultStatus),
                intValue(values, "onboardingCurrentStep", 0),
                settings.deviceName(),
                runtimeLayout.runtimeRoot().toString(),
                settingsRepository.backupDestination(defaultBackupDestination()).toString(),
                tailscaleService.status().connected(),
                value(values, "privateAccessChoice", tailscaleService.status().connected() ? "already-connected" : "local-only"),
                settings.automaticBackupsEnabled(),
                listValue(values, "onboardingRecommendedApps", DEFAULT_RECOMMENDED_APPS),
                listValue(values, "onboardingCompletedSteps", List.of()),
                doctorService.status(),
                instantValue(values, "onboardingUpdatedAt"));
    }

    public OnboardingState update(OnboardingUpdateRequest request) {
        Map<String, String> updates = new LinkedHashMap<>();
        if (request.status() != null && !request.status().isBlank()) {
            updates.put("onboardingStatus", cleanStatus(request.status()));
        }
        if (request.currentStep() != null) {
            updates.put("onboardingCurrentStep", Integer.toString(Math.max(0, Math.min(request.currentStep(), 6))));
        }
        if (request.backupDestination() != null) {
            updates.put("backupDestination", cleanBackupDestination(request.backupDestination()));
        }
        if (request.privateAccessChoice() != null) {
            updates.put("privateAccessChoice", cleanPrivateAccessChoice(request.privateAccessChoice()));
        }
        if (request.recommendedApps() != null) {
            updates.put("onboardingRecommendedApps", encodeList(request.recommendedApps()));
        }
        if (request.completedSteps() != null) {
            updates.put("onboardingCompletedSteps", encodeList(request.completedSteps()));
        }
        updates.put("onboardingUpdatedAt", Instant.now().toString());
        if (!updates.isEmpty()) {
            settingsRepository.saveValues(updates);
        }
        if (request.deviceName() != null || request.automaticBackupsEnabled() != null) {
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
                    request.automaticBackupsEnabled() == null ? current.automaticBackupsEnabled() : request.automaticBackupsEnabled(),
                    current.backupFrequency(),
                    current.backupRetentionDays(),
                    current.backupTime(),
                    current.updateChannel(),
                    current.showAdvancedMetrics(),
                    Instant.now()));
        }
        return state();
    }

    public OnboardingState complete() {
        return update(new OnboardingUpdateRequest("complete", 6, null, null, null, null, null, List.of("device", "doctor", "tailscale", "storage", "backups", "apps")));
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
        if (value == null || value.isBlank()) {
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

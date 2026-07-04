package com.autarkos.system;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.marketplace.install.InstallationException;

@Service
public class SetupProgressService {

    private static final int SETUP_VERSION = 1;
    private static final List<String> STEPS = List.of(
            "welcome",
            "host_check",
            "docker_check",
            "access_choice",
            "tailscale_connect",
            "starter_apps",
            "first_backup",
            "done");
    private static final String COMPLETED_KEY = "setupProgressCompletedSteps";
    private static final String SKIPPED_KEY = "setupProgressSkippedSteps";
    private static final String UPDATED_KEY = "setupProgressUpdatedAt";

    private final ProjectSettingsRepository repository;
    private final Supplier<Instant> clock;

    @Autowired
    public SetupProgressService(ProjectSettingsRepository repository) {
        this(repository, Instant::now);
    }

    SetupProgressService(ProjectSettingsRepository repository, Supplier<Instant> clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public SetupProgressModels.SetupProgress status() {
        Map<String, String> values = repository.readAll();
        List<String> completed = listValue(values.get(COMPLETED_KEY));
        List<String> skipped = listValue(values.get(SKIPPED_KEY));
        boolean setupComplete = completed.contains("done");
        return new SetupProgressModels.SetupProgress(
                SETUP_VERSION,
                completed,
                skipped,
                setupComplete ? "done" : nextStep(completed, skipped),
                setupComplete,
                instantValue(values.get(UPDATED_KEY)));
    }

    public SetupProgressModels.SetupProgress completeStep(String step) {
        String normalized = cleanStep(step);
        SetupProgressModels.SetupProgress current = status();
        List<String> completed = append(current.completedSteps(), normalized);
        List<String> skipped = without(current.skippedSteps(), normalized);
        save(completed, skipped);
        return status();
    }

    public SetupProgressModels.SetupProgress skipStep(String step) {
        String normalized = cleanStep(step);
        SetupProgressModels.SetupProgress current = status();
        List<String> skipped = append(current.skippedSteps(), normalized);
        List<String> completed = without(current.completedSteps(), normalized);
        save(completed, skipped);
        return status();
    }

    private void save(List<String> completed, List<String> skipped) {
        repository.saveValues(Map.of(
                COMPLETED_KEY, encode(completed),
                SKIPPED_KEY, encode(skipped),
                UPDATED_KEY, clock.get().toString()));
    }

    private String nextStep(List<String> completed, List<String> skipped) {
        Set<String> completeOrSkipped = new LinkedHashSet<>();
        completeOrSkipped.addAll(completed);
        completeOrSkipped.addAll(skipped);
        return STEPS.stream()
                .filter(step -> !"done".equals(step))
                .filter(step -> !completeOrSkipped.contains(step))
                .findFirst()
                .orElse("done");
    }

    private String cleanStep(String step) {
        if (step == null || step.isBlank()) {
            throw new InstallationException("Setup step is required.");
        }
        String normalized = step.trim().toLowerCase();
        if (!STEPS.contains(normalized)) {
            throw new InstallationException("Unknown setup step: " + step);
        }
        return normalized;
    }

    private List<String> listValue(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        return Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(STEPS::contains)
                .distinct()
                .toList();
    }

    private List<String> append(List<String> values, String value) {
        List<String> copy = new ArrayList<>(values);
        if (!copy.contains(value)) {
            copy.add(value);
        }
        return copy;
    }

    private List<String> without(List<String> values, String value) {
        return values.stream()
                .filter(existing -> !existing.equals(value))
                .toList();
    }

    private String encode(List<String> values) {
        return values.stream()
                .filter(STEPS::contains)
                .distinct()
                .collect(Collectors.joining(","));
    }

    private Instant instantValue(String value) {
        if (value == null || value.isBlank()) {
            return clock.get();
        }
        try {
            return Instant.parse(value);
        } catch (RuntimeException exception) {
            return clock.get();
        }
    }
}

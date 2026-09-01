package com.autarkos.marketplace.catalog;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.yaml.snakeyaml.Yaml;

/**
 * Validates the source catalog layout before it is packaged. Classpath scanning cannot retain
 * empty directories, so this release-time check is the guard against an accidentally incomplete
 * catalog entry.
 */
public class CatalogSourceLayoutValidator {

    public void validate(Path catalogRoot) {
        List<String> errors = new ArrayList<>();
        if (!Files.isDirectory(catalogRoot)) {
            throw new ManifestValidationException("catalog", List.of("catalog source directory is missing: " + catalogRoot));
        }
        try (var entries = Files.list(catalogRoot)) {
            entries.filter(Files::isDirectory)
                    .sorted()
                    .forEach(directory -> validateEntry(directory, errors));
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to inspect catalog source directory " + catalogRoot, exception);
        }
        if (!errors.isEmpty()) {
            throw new ManifestValidationException("catalog", errors);
        }
    }

    private void validateEntry(Path directory, List<String> errors) {
        String id = directory.getFileName().toString();
        Path manifest = directory.resolve("manifest.yaml");
        requireNonEmptyFile(manifest, id + " is missing manifest.yaml", errors);
        requireNonEmptyFile(directory.resolve("compose.yaml"), id + " is missing compose.yaml", errors);
        validateManifestSections(manifest, id, errors);
        validateProvisionedFiles(manifest, directory, id, errors);
    }

    private void requireNonEmptyFile(Path file, String error, List<String> errors) {
        try {
            if (!Files.isRegularFile(file) || Files.size(file) == 0) {
                errors.add(error);
            }
        } catch (IOException exception) {
            errors.add(error);
        }
    }

    private void validateManifestSections(Path manifest, String id, List<String> errors) {
        if (!Files.isRegularFile(manifest)) {
            return;
        }
        try {
            String source = Files.readString(manifest);
            for (String section : List.of("id:", "metadata:", "testing:", "user:", "technical:", "access:", "usage:", "health:", "runtime:")) {
                if (!source.contains("\n" + section) && !source.startsWith(section)) {
                    errors.add(id + " is missing required " + section + " manifest section");
                }
            }
        } catch (IOException exception) {
            errors.add(id + " manifest.yaml could not be read");
        }
    }

    @SuppressWarnings("unchecked")
    private void validateProvisionedFiles(Path manifest, Path directory, String id, List<String> errors) {
        if (!Files.isRegularFile(manifest)) {
            return;
        }
        try {
            Object rootValue = new Yaml().load(Files.readString(manifest));
            if (!(rootValue instanceof Map<?, ?> root) || !(root.get("runtime") instanceof Map<?, ?> runtime)) {
                return;
            }
            Object filesValue = runtime.get("provisionedFiles");
            if (!(filesValue instanceof List<?> files)) {
                return;
            }
            for (Object fileValue : files) {
                if (!(fileValue instanceof Map<?, ?> file) || !(file.get("source") instanceof String source) || source.isBlank()) {
                    continue;
                }
                Path sourceFile = directory.resolve(source).normalize();
                if (!sourceFile.startsWith(directory) || !Files.isRegularFile(sourceFile) || Files.size(sourceFile) == 0) {
                    errors.add(id + " is missing provisioned catalog file " + source);
                }
            }
        } catch (IOException exception) {
            errors.add(id + " manifest.yaml could not be read");
        }
    }
}

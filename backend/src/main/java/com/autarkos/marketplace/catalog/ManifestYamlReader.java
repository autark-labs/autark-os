package com.autarkos.marketplace.catalog;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;

import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.model.AccessManifest;
import com.autarkos.marketplace.model.ConfigurationItem;
import com.autarkos.marketplace.model.CatalogSmokeTest;
import com.autarkos.marketplace.model.HealthManifest;
import com.autarkos.marketplace.model.RuntimeManifest;
import com.autarkos.marketplace.model.RuntimeServiceManifest;
import com.autarkos.marketplace.model.SetupField;
import com.autarkos.marketplace.model.SetupGeneratedValue;
import com.autarkos.marketplace.model.SetupIntegration;
import com.autarkos.marketplace.model.SetupManifest;
import com.autarkos.marketplace.model.UsageField;
import com.autarkos.marketplace.model.UsageManifest;

@Component
public class ManifestYamlReader {

    public ApplicationManifest read(Resource resource) {
        try (InputStream inputStream = resource.getInputStream()) {
            Map<String, Object> root = new Yaml().load(inputStream);
            Map<String, Object> metadata = map(root, "metadata");
            Map<String, Object> user = map(root, "user");
            Map<String, Object> technical = map(root, "technical");
            Map<String, Object> access = map(root, "access");
            Map<String, Object> usage = map(root, "usage");
            Map<String, Object> setup = map(root, "setup");
            Map<String, Object> health = map(root, "health");
            Map<String, Object> testing = map(root, "testing");
            Map<String, Object> runtime = map(root, "runtime");
            AccessManifest accessManifest = accessManifest(access);
            UsageManifest usageManifest = usageManifest(usage);
            SetupManifest setupManifest = setupManifest(setup);

            return new ApplicationManifest(
                    text(root, "id"),
                    text(metadata, "name"),
                    text(metadata, "category"),
                    text(metadata, "description"),
                    text(metadata, "shortValue"),
                    text(metadata, "badge"),
                    text(metadata, "downloads"),
                    text(metadata, "rating"),
                    text(metadata, "image"),
                    text(metadata, "version"),
                    text(metadata, "lastUpdated"),
                    text(metadata, "size"),
                    text(metadata, "maintainer"),
                    text(metadata, "source"),
                    text(metadata, "sourceUrl"),
                    text(metadata, "documentationUrl"),
                    text(metadata, "installTime"),
                    text(metadata, "difficulty"),
                    text(metadata, "supportLevel"),
                    text(metadata, "supportSummary"),
                    text(metadata, "accessUrl"),
                    strings(metadata, "tags"),
                    strings(user, "bestFor"),
                    strings(user, "highlights"),
                    text(user, "plainLanguage"),
                    text(technical, "summary"),
                    strings(technical, "requirements"),
                    strings(technical, "includes"),
                    configurationItems(technical),
                    accessManifest,
                    usageManifest,
                    setupManifest,
                    healthManifest(health, accessManifest, usageManifest),
                    smokeTests(testing),
                    runtimeManifest(runtime, accessManifest, usageManifest));
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to read manifest " + resource.getFilename(), exception);
        }
    }

    private RuntimeManifest runtimeManifest(Map<String, Object> runtime, AccessManifest access, UsageManifest usage) {
        return new RuntimeManifest(
                text(runtime, "containerName"),
                text(runtime, "composeProject"),
                text(runtime, "image"),
                text(runtime, "network"),
                text(runtime, "runtimeRoot"),
                strings(runtime, "ports"),
                strings(runtime, "volumes"),
                strings(runtime, "environment"),
                strings(runtime, "labels"),
                strings(runtime, "backupPaths"),
                text(runtime, "backupStrategy"),
                integer(runtime, "backupContractVersion", 0),
                bool(runtime, "privileged"),
                runtimeServices(runtime, access, usage));
    }

    private int integer(Map<String, Object> values, String key, int fallback) {
        Object value = values.get(key);
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text) {
            try {
                return Integer.parseInt(text.trim());
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    private List<RuntimeServiceManifest> runtimeServices(Map<String, Object> runtime, AccessManifest access, UsageManifest usage) {
        return listOfMaps(runtime, "services").stream()
                .map(service -> new RuntimeServiceManifest(
                        text(service, "name"),
                        text(service, "containerName"),
                        text(service, "image"),
                        strings(service, "ports"),
                        strings(service, "volumes"),
                        strings(service, "environment"),
                        strings(service, "dependsOn"),
                        strings(service, "labels"),
                        healthManifest(map(service, "health"), access, usage),
                        bool(service, "privileged")))
                .toList();
    }

    private AccessManifest accessManifest(Map<String, Object> access) {
        if (access.isEmpty()) {
            return AccessManifest.defaults();
        }
        return new AccessManifest(
                text(access, "kind"),
                text(access, "defaultMode"),
                bool(access, "privateAccessRecommended"),
                bool(access, "requiresFirstRunSetup"),
                strings(access, "notes"));
    }

    private UsageManifest usageManifest(Map<String, Object> usage) {
        if (usage.isEmpty()) {
            return UsageManifest.defaults();
        }
        return new UsageManifest(
                text(usage, "kind"),
                text(usage, "primaryAction"),
                text(usage, "openUrlLabel"),
                text(usage, "headline"),
                text(usage, "summary"),
                bool(usage, "privateHttpsRequired"),
                strings(usage, "setupSteps"),
                usageFields(usage),
                strings(usage, "notes"));
    }

    private SetupManifest setupManifest(Map<String, Object> setup) {
        if (setup.isEmpty()) {
            return SetupManifest.defaults();
        }
        return new SetupManifest(
                textOrDefault(setup, "kind", "basic"),
                textOrDefault(setup, "automation", "manual"),
                setupGeneratedValues(setup),
                setupFields(setup, "copyableFields"),
                setupFields(setup, "qrFields"),
                setupIntegrations(setup),
                strings(setup, "userSteps"),
                strings(setup, "automationCapabilities"));
    }

    private HealthManifest healthManifest(Map<String, Object> health, AccessManifest access, UsageManifest usage) {
        HealthManifest defaults = HealthManifest.defaults(access, usage);
        if (health.isEmpty()) {
            return defaults;
        }
        return new HealthManifest(
                textOrDefault(health, "type", defaults.type()),
                textOrDefault(health, "path", defaults.path()),
                intOrDefault(health, "startupGraceSeconds", defaults.startupGraceSeconds()),
                textOrDefault(health, "successLabel", defaults.successLabel()),
                textOrDefault(health, "startingLabel", defaults.startingLabel()),
                textOrDefault(health, "failureLabel", defaults.failureLabel()),
                textOrDefault(health, "description", defaults.description()));
    }

    private List<UsageField> usageFields(Map<String, Object> usage) {
        return listOfMaps(usage, "fields").stream()
                .map(field -> new UsageField(
                        text(field, "label"),
                        text(field, "value"),
                        bool(field, "sensitive"),
                        bool(field, "qr")))
                .toList();
    }

    private List<SetupGeneratedValue> setupGeneratedValues(Map<String, Object> setup) {
        return listOfMaps(setup, "generatedValues").stream()
                .map(field -> new SetupGeneratedValue(
                        text(field, "label"),
                        text(field, "value"),
                        bool(field, "sensitive"),
                        bool(field, "recoverable")))
                .toList();
    }

    private List<SetupField> setupFields(Map<String, Object> setup, String key) {
        return listOfMaps(setup, key).stream()
                .map(field -> new SetupField(
                        text(field, "label"),
                        text(field, "value"),
                        bool(field, "sensitive")))
                .toList();
    }

    private List<SetupIntegration> setupIntegrations(Map<String, Object> setup) {
        return listOfMaps(setup, "integrations").stream()
                .map(item -> new SetupIntegration(
                        text(item, "id"),
                        text(item, "name"),
                        text(item, "targetAppId"),
                        text(item, "description"),
                        bool(item, "requiresApproval"),
                        strings(item, "plannedActions")))
                .toList();
    }

    private List<ConfigurationItem> configurationItems(Map<String, Object> technical) {
        return listOfMaps(technical, "configuration").stream()
                .map(item -> new ConfigurationItem(text(item, "label"), text(item, "value")))
                .toList();
    }

    private List<CatalogSmokeTest> smokeTests(Map<String, Object> testing) {
        return listOfMaps(testing, "smokeTests").stream()
                .map(item -> new CatalogSmokeTest(
                        text(item, "label"),
                        text(item, "status"),
                        text(item, "detail")))
                .toList();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> map(Map<String, Object> source, String key) {
        Object value = source.get(key);
        if (value instanceof Map<?, ?> map) {
            return (Map<String, Object>) map;
        }
        return Map.of();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> listOfMaps(Map<String, Object> source, String key) {
        Object value = source.get(key);
        if (value instanceof List<?> list) {
            return (List<Map<String, Object>>) list;
        }
        return List.of();
    }

    private List<String> strings(Map<String, Object> source, String key) {
        Object value = source.get(key);
        if (value instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        if (value instanceof String text && !text.isBlank()) {
            return List.of(text);
        }
        return List.of();
    }

    private String text(Map<String, Object> source, String key) {
        Object value = source.get(key);
        return value == null ? "" : String.valueOf(value);
    }

    private boolean bool(Map<String, Object> source, String key) {
        Object value = source.get(key);
        return value instanceof Boolean bool ? bool : Boolean.parseBoolean(String.valueOf(value));
    }

    private int intOrDefault(Map<String, Object> source, String key, int defaultValue) {
        Object value = source.get(key);
        if (value == null || String.valueOf(value).isBlank()) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return Integer.MIN_VALUE;
        }
    }

    private String textOrDefault(Map<String, Object> source, String key, String defaultValue) {
        String value = text(source, key);
        return value.isBlank() ? defaultValue : value;
    }
}

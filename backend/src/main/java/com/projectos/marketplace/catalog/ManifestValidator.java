package com.projectos.marketplace.catalog;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.projectos.marketplace.model.ApplicationManifest;
import com.projectos.marketplace.model.RuntimeServiceManifest;

@Component
public class ManifestValidator {

    private static final Pattern SAFE_ID = Pattern.compile("[a-z0-9][a-z0-9-]{1,63}");
    private static final Pattern IMAGE = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._:/@-]+");
    private static final Pattern HTTP_URL = Pattern.compile("https?://[^\\s]+");
    private static final Pattern ENVIRONMENT_KEY = Pattern.compile("[A-Z_][A-Z0-9_]*");
    private static final Pattern SAFE_RUNTIME_PATH = Pattern.compile("/var/lib/project-os/apps/[a-z0-9][a-z0-9-]*(/[A-Za-z0-9._-]+)*");
    private static final Pattern CONTAINER_PATH = Pattern.compile("/[A-Za-z0-9._/-]+");
    private static final Set<String> ACCESS_KINDS = Set.of("web", "api", "background", "multi-port");
    private static final Set<String> ACCESS_MODES = Set.of("local", "private", "local-and-private", "none");
    private static final Set<String> USAGE_KINDS = Set.of("web-app", "companion-service", "admin-service", "background-service", "infrastructure");
    private static final Set<String> SETUP_KINDS = Set.of("basic", "companion", "dashboard", "integration", "media-stack", "infrastructure");
    private static final Set<String> SETUP_AUTOMATION = Set.of("manual", "guided", "ready", "planned");
    private static final Set<String> HEALTH_TYPES = Set.of("http", "tcp", "container", "no-web-ui", "none");
    private static final Set<String> SUPPORT_LEVELS = Set.of("Ready", "Needs testing", "Advanced", "Experimental");
    private static final Set<String> SMOKE_TEST_STATUSES = Set.of("Passed", "Needs hardware test", "Needs end-to-end test", "Blocked", "Not applicable");

    public void validate(ApplicationManifest manifest) {
        List<String> errors = new ArrayList<>();

        require(errors, "id", manifest.id());
        if (manifest.id() != null && !manifest.id().isBlank() && !SAFE_ID.matcher(manifest.id()).matches()) {
            errors.add("id must use lowercase letters, numbers, and dashes only");
        }
        require(errors, "name", manifest.name());
        require(errors, "category", manifest.category());
        require(errors, "description", manifest.description());
        require(errors, "metadata.sourceUrl", manifest.sourceUrl());
        require(errors, "metadata.supportLevel", manifest.supportLevel());
        require(errors, "metadata.supportSummary", manifest.supportSummary());
        require(errors, "plainLanguage", manifest.plainLanguage());
        require(errors, "technicalSummary", manifest.technicalSummary());
        require(errors, "runtime.composeProject", manifest.runtime().composeProject());
        require(errors, "runtime.network", manifest.runtime().network());
        require(errors, "runtime.runtimeRoot", manifest.runtime().runtimeRoot());
        if (!manifest.runtime().multiService()) {
            require(errors, "runtime.containerName", manifest.runtime().containerName());
            require(errors, "runtime.image", manifest.runtime().image());
        }
        require(errors, "access.kind", manifest.access().kind());
        require(errors, "access.defaultMode", manifest.access().defaultMode());
        require(errors, "usage.kind", manifest.usage().kind());
        require(errors, "usage.primaryAction", manifest.usage().primaryAction());
        require(errors, "usage.openUrlLabel", manifest.usage().openUrlLabel());
        require(errors, "setup.kind", manifest.setup().kind());
        require(errors, "setup.automation", manifest.setup().automation());
        require(errors, "health.type", manifest.health().type());

        if (!manifest.runtime().image().isBlank() && !IMAGE.matcher(manifest.runtime().image()).matches()) {
            errors.add("runtime.image must be a valid container image reference");
        }

        if (!manifest.runtime().runtimeRoot().isBlank() && !manifest.runtime().runtimeRoot().equals("/var/lib/project-os/apps/" + manifest.id())) {
            errors.add("runtime.runtimeRoot must equal /var/lib/project-os/apps/" + manifest.id());
        }

        if (declaredVolumes(manifest).isEmpty()) {
            errors.add("runtime.volumes must contain at least one managed storage mapping");
        }

        for (String volume : declaredVolumes(manifest)) {
            validateVolume(errors, manifest, volume);
        }

        for (String port : declaredPorts(manifest)) {
            validatePort(errors, port);
        }

        for (String environment : declaredEnvironment(manifest)) {
            validateEnvironment(errors, environment);
        }

        validateServices(errors, manifest);

        for (String backupPath : manifest.runtime().backupPaths()) {
            if (backupPath == null || backupPath.isBlank() || backupPath.startsWith("/") || backupPath.contains("..")) {
                errors.add("runtime.backupPaths entries must be relative managed paths: " + backupPath);
            }
        }

        if (manifest.runtime().privileged()) {
            errors.add("runtime.privileged containers are not allowed in Story 1 manifests");
        }

        if (!ACCESS_KINDS.contains(manifest.access().kind())) {
            errors.add("access.kind must be one of " + ACCESS_KINDS);
        }

        if (!ACCESS_MODES.contains(manifest.access().defaultMode())) {
            errors.add("access.defaultMode must be one of " + ACCESS_MODES);
        }

        if (!USAGE_KINDS.contains(manifest.usage().kind())) {
            errors.add("usage.kind must be one of " + USAGE_KINDS);
        }

        if (!SETUP_KINDS.contains(manifest.setup().kind())) {
            errors.add("setup.kind must be one of " + SETUP_KINDS);
        }

        if (!SETUP_AUTOMATION.contains(manifest.setup().automation())) {
            errors.add("setup.automation must be one of " + SETUP_AUTOMATION);
        }

        if (!HEALTH_TYPES.contains(manifest.health().type())) {
            errors.add("health.type must be one of " + HEALTH_TYPES);
        }

        if (!SUPPORT_LEVELS.contains(manifest.supportLevel())) {
            errors.add("metadata.supportLevel must be one of " + SUPPORT_LEVELS);
        }

        if (manifest.health().startupGraceSeconds() < 10 || manifest.health().startupGraceSeconds() > 1800) {
            errors.add("health.startupGraceSeconds must be between 10 and 1800");
        }

        if (!manifest.health().path().isBlank() && !manifest.health().path().startsWith("/")) {
            errors.add("health.path must start with / when provided");
        }

        for (var field : manifest.usage().fields()) {
            if (field.label() == null || field.label().isBlank()) {
                errors.add("usage.fields label is required");
            }
            if (field.value() == null || field.value().isBlank()) {
                errors.add("usage.fields value is required for " + field.label());
            }
        }

        for (var field : manifest.setup().generatedValues()) {
            require(errors, "setup.generatedValues.label", field.label());
            require(errors, "setup.generatedValues.value", field.value());
        }

        for (var field : manifest.setup().copyableFields()) {
            require(errors, "setup.copyableFields.label", field.label());
            require(errors, "setup.copyableFields.value", field.value());
        }

        for (var field : manifest.setup().qrFields()) {
            require(errors, "setup.qrFields.label", field.label());
            require(errors, "setup.qrFields.value", field.value());
        }

        for (var integration : manifest.setup().integrations()) {
            require(errors, "setup.integrations.id", integration.id());
            require(errors, "setup.integrations.name", integration.name());
            require(errors, "setup.integrations.description", integration.description());
            if (integration.targetAppId() != null && !integration.targetAppId().isBlank() && !SAFE_ID.matcher(integration.targetAppId()).matches()) {
                errors.add("setup.integrations targetAppId must use lowercase letters, numbers, and dashes only: " + integration.name());
            }
        }

        if (manifest.smokeTests().isEmpty()) {
            errors.add("testing.smokeTests must include at least one catalog confidence check");
        }

        for (var smokeTest : manifest.smokeTests()) {
            require(errors, "testing.smokeTests.label", smokeTest.label());
            require(errors, "testing.smokeTests.status", smokeTest.status());
            if (!smokeTest.status().isBlank() && !SMOKE_TEST_STATUSES.contains(smokeTest.status())) {
                errors.add("testing.smokeTests.status must be one of " + SMOKE_TEST_STATUSES + ": " + smokeTest.label());
            }
        }

        if (Set.of("web", "api", "multi-port").contains(manifest.access().kind()) && manifest.accessUrl().isBlank()) {
            errors.add("metadata.accessUrl is required for " + manifest.access().kind() + " apps");
        }

        if ("background".equals(manifest.access().kind()) && !manifest.accessUrl().isBlank()) {
            errors.add("metadata.accessUrl should be blank for background apps");
        }

        if (!manifest.accessUrl().isBlank() && !manifest.accessUrl().startsWith("http://") && !manifest.accessUrl().startsWith("https://")) {
            errors.add("metadata.accessUrl must start with http:// or https://");
        }

        validateHttpUrl(errors, "metadata.sourceUrl", manifest.sourceUrl());
        validateHttpUrl(errors, "metadata.documentationUrl", manifest.documentationUrl());

        if (!errors.isEmpty()) {
            throw new ManifestValidationException(manifest.id(), errors);
        }
    }

    public void validateCatalog(List<ApplicationManifest> manifests) {
        List<String> errors = new ArrayList<>();
        Map<String, String> ids = new HashMap<>();
        Map<String, String> hostPorts = new HashMap<>();
        for (ApplicationManifest manifest : manifests) {
            String previousId = ids.putIfAbsent(manifest.id(), manifest.name());
            if (previousId != null) {
                errors.add("Duplicate app id '" + manifest.id() + "' used by " + previousId + " and " + manifest.name());
            }
            Set<String> manifestPorts = new HashSet<>();
            for (String port : declaredPorts(manifest)) {
                PortMapping mapping = parsePort(port);
                if (mapping.hostPort().isBlank()) {
                    continue;
                }
                String key = mapping.hostPort() + "/" + mapping.protocol();
                if (!manifestPorts.add(key)) {
                    errors.add(manifest.id() + " declares duplicate host port " + key);
                }
                String previousApp = hostPorts.putIfAbsent(key, manifest.id());
                if (previousApp != null) {
                    errors.add("Duplicate preferred host port " + key + " used by " + previousApp + " and " + manifest.id());
                }
            }
        }
        if (!errors.isEmpty()) {
            throw new ManifestValidationException("catalog", errors);
        }
    }

    private void validatePort(List<String> errors, String port) {
        try {
            PortMapping mapping = parsePort(port);
            validatePortNumber(errors, "host port", mapping.hostPort(), port, true);
            validatePortNumber(errors, "container port", mapping.containerPort(), port, false);
            if (!Set.of("tcp", "udp").contains(mapping.protocol())) {
                errors.add("runtime.ports protocol must be tcp or udp: " + port);
            }
        } catch (IllegalArgumentException exception) {
            errors.add("runtime.ports entries must use host:container[/protocol] format: " + port);
        }
    }

    private void validateVolume(List<String> errors, ApplicationManifest manifest, String volume) {
        String[] parts = volume.split(":", 2);
        if (parts.length != 2) {
            errors.add("runtime.volumes entries must use host:container format: " + volume);
            return;
        }
        String hostPath = parts[0];
        String containerPath = parts[1];
        if (!hostPath.startsWith(manifest.runtime().runtimeRoot())) {
            errors.add("runtime.volumes host path is outside the Project-OS runtime root: " + volume);
        }
        if (!SAFE_RUNTIME_PATH.matcher(hostPath).matches()) {
            errors.add("runtime.volumes host path must stay under the managed app folder and use safe path characters: " + volume);
        }
        if (!CONTAINER_PATH.matcher(containerPath).matches()) {
            errors.add("runtime.volumes container path must be absolute and use safe path characters: " + volume);
        }
    }

    private void validateServices(List<String> errors, ApplicationManifest manifest) {
        if (!manifest.runtime().multiService()) {
            return;
        }
        Set<String> serviceNames = new HashSet<>();
        for (RuntimeServiceManifest service : manifest.runtime().services()) {
            require(errors, "runtime.services.name", service.name());
            require(errors, "runtime.services.containerName", service.containerName());
            require(errors, "runtime.services.image", service.image());
            if (!service.name().isBlank() && !SAFE_ID.matcher(service.name()).matches()) {
                errors.add("runtime.services.name must use lowercase letters, numbers, and dashes only: " + service.name());
            }
            if (!service.image().isBlank() && !IMAGE.matcher(service.image()).matches()) {
                errors.add("runtime.services.image must be a valid container image reference: " + service.name());
            }
            if (!serviceNames.add(service.name())) {
                errors.add("runtime.services declares duplicate service name: " + service.name());
            }
            if (service.privileged()) {
                errors.add("runtime.services.privileged containers are not allowed: " + service.name());
            }
        }
        for (RuntimeServiceManifest service : manifest.runtime().services()) {
            for (String dependency : service.dependsOn()) {
                if (!serviceNames.contains(dependency)) {
                    errors.add("runtime.services.dependsOn references unknown service '" + dependency + "' from " + service.name());
                }
            }
        }
    }

    private List<String> declaredPorts(ApplicationManifest manifest) {
        if (!manifest.runtime().multiService()) {
            return manifest.runtime().ports();
        }
        return manifest.runtime().services().stream().flatMap(service -> service.ports().stream()).toList();
    }

    private List<String> declaredVolumes(ApplicationManifest manifest) {
        if (!manifest.runtime().multiService()) {
            return manifest.runtime().volumes();
        }
        return manifest.runtime().services().stream().flatMap(service -> service.volumes().stream()).toList();
    }

    private List<String> declaredEnvironment(ApplicationManifest manifest) {
        if (!manifest.runtime().multiService()) {
            return manifest.runtime().environment();
        }
        return manifest.runtime().services().stream().flatMap(service -> service.environment().stream()).toList();
    }

    private void validatePortNumber(List<String> errors, String label, String value, String source, boolean allowBlank) {
        if (value.isBlank() && allowBlank) {
            return;
        }
        try {
            int port = Integer.parseInt(value);
            if (port < 1 || port > 65535) {
                errors.add("runtime.ports " + label + " must be between 1 and 65535: " + source);
            }
        } catch (NumberFormatException exception) {
            errors.add("runtime.ports " + label + " must be numeric: " + source);
        }
    }

    private PortMapping parsePort(String port) {
        String[] protocolParts = port.split("/", 2);
        String protocol = protocolParts.length == 2 ? protocolParts[1].trim().toLowerCase() : "tcp";
        String[] parts = protocolParts[0].split(":", 2);
        if (parts.length != 2) {
            throw new IllegalArgumentException("Invalid port");
        }
        return new PortMapping(parts[0].trim(), parts[1].trim(), protocol);
    }

    private void validateEnvironment(List<String> errors, String environment) {
        if (environment == null || environment.isBlank() || !environment.contains("=")) {
            errors.add("runtime.environment entries must use KEY=value format");
            return;
        }
        String[] parts = environment.split("=", 2);
        if (!ENVIRONMENT_KEY.matcher(parts[0]).matches()) {
            errors.add("runtime.environment keys must use uppercase letters, numbers, and underscores: " + parts[0]);
        }
        if (parts[1].contains("\n") || parts[1].contains("\r")) {
            errors.add("runtime.environment values must be single-line values: " + parts[0]);
        }
    }

    private void require(List<String> errors, String field, String value) {
        if (value == null || value.isBlank()) {
            errors.add(field + " is required");
        }
    }

    private void validateHttpUrl(List<String> errors, String field, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        if (!HTTP_URL.matcher(value).matches()) {
            errors.add(field + " must start with http:// or https://");
        }
    }

    private record PortMapping(String hostPort, String containerPort, String protocol) {
    }
}

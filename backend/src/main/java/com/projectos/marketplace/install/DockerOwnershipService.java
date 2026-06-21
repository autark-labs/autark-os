package com.projectos.marketplace.install;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.projectos.system.InstanceIdentityService;
import com.projectos.system.ProjectOsIdentity;

@Service
public class DockerOwnershipService {

    public static final String MANAGED = "project-os.managed";
    public static final String INSTANCE_ID = "project-os.instance-id";
    public static final String RUNTIME_ROOT_HASH = "project-os.runtime-root-hash";
    public static final String APP_ID = "project-os.app-id";
    public static final String APP_INSTANCE_ID = "project-os.app-instance-id";
    public static final String COMPOSE_PROJECT = "project-os.compose-project";
    public static final String PROJECT_OS_VERSION = "project-os.version";

    private final Supplier<ProjectOsIdentity> identitySupplier;
    private final Supplier<String> versionSupplier;
    private final boolean devMode;

    @Autowired
    public DockerOwnershipService(InstanceIdentityService identityService, @Value("${project-os.dev-mode:false}") boolean devMode) {
        this(identityService::current, DockerOwnershipService::projectOsVersion, devMode);
    }

    public DockerOwnershipService(Supplier<ProjectOsIdentity> identitySupplier, Supplier<String> versionSupplier, boolean devMode) {
        this.identitySupplier = identitySupplier;
        this.versionSupplier = versionSupplier;
        this.devMode = devMode;
    }

    public String composeProject(String appId) {
        ProjectOsIdentity identity = identitySupplier.get();
        if (devMode) {
            return "projectos_dev_" + shortInstanceId(identity.instanceId()) + "_" + safeToken(appId);
        }
        return "projectos_" + safeToken(identity.instanceSlug()) + "_" + safeToken(appId);
    }

    public ProjectOsIdentity currentIdentity() {
        return identitySupplier.get();
    }

    public Map<String, String> labels(String appId, String appInstanceId, String composeProject) {
        ProjectOsIdentity identity = identitySupplier.get();
        Map<String, String> labels = new LinkedHashMap<>();
        labels.put(MANAGED, "true");
        labels.put(INSTANCE_ID, identity.instanceId());
        labels.put(RUNTIME_ROOT_HASH, identity.runtimeRootHash());
        labels.put(APP_ID, appId);
        labels.put(APP_INSTANCE_ID, appInstanceId);
        labels.put(COMPOSE_PROJECT, composeProject);
        labels.put(PROJECT_OS_VERSION, versionSupplier.get());
        return labels;
    }

    public List<String> composeLabelEntries(String appId, String appInstanceId, String composeProject) {
        return labels(appId, appInstanceId, composeProject).entrySet().stream()
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .toList();
    }

    public Map<String, String> parseLabels(List<String> labels) {
        Map<String, String> parsed = new LinkedHashMap<>();
        for (String label : labels) {
            int separator = label.indexOf('=');
            if (separator <= 0) {
                continue;
            }
            parsed.put(label.substring(0, separator), label.substring(separator + 1));
        }
        return parsed;
    }

    public DockerResourceClassification classify(String containerName, Map<String, String> labels) {
        String appId = labels.getOrDefault(APP_ID, "");
        String appInstanceId = labels.getOrDefault(APP_INSTANCE_ID, "");
        String composeProject = labels.getOrDefault(COMPOSE_PROJECT, "");
        if (!"true".equalsIgnoreCase(labels.getOrDefault(MANAGED, ""))) {
            if (containerName != null && containerName.startsWith("project-os-")) {
                return new DockerResourceClassification(DockerResourceOwnership.LEGACY_UNSCOPED, appId, appInstanceId, composeProject);
            }
            return new DockerResourceClassification(DockerResourceOwnership.UNMANAGED, appId, appInstanceId, composeProject);
        }

        ProjectOsIdentity identity = identitySupplier.get();
        if (identity.instanceId().equals(labels.get(INSTANCE_ID))
                && identity.runtimeRootHash().equals(labels.get(RUNTIME_ROOT_HASH))) {
            return new DockerResourceClassification(DockerResourceOwnership.OWNED, appId, appInstanceId, composeProject);
        }
        if (isBlank(labels.get(INSTANCE_ID)) || isBlank(labels.get(RUNTIME_ROOT_HASH))) {
            return new DockerResourceClassification(DockerResourceOwnership.LEGACY_UNSCOPED, appId, appInstanceId, composeProject);
        }
        return new DockerResourceClassification(DockerResourceOwnership.FOREIGN, appId, appInstanceId, composeProject);
    }

    private static String shortInstanceId(String instanceId) {
        String cleaned = instanceId == null ? "" : instanceId.replaceFirst("^pos_", "").replaceAll("[^A-Za-z0-9]", "");
        if (cleaned.length() >= 8) {
            return cleaned.substring(0, 8).toLowerCase(Locale.ROOT);
        }
        return cleaned.isBlank() ? "unknown" : cleaned.toLowerCase(Locale.ROOT);
    }

    private static String safeToken(String value) {
        String token = value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_-]+", "-").replaceAll("(^[-_]+|[-_]+$)", "");
        return token.isBlank() ? "project-os" : token;
    }

    private static String projectOsVersion() {
        String version = System.getenv("PROJECT_OS_VERSION");
        return version == null || version.isBlank() ? "development" : version;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}

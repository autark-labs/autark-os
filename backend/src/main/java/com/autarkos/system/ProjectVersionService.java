package com.autarkos.system;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.jar.Attributes;
import java.util.jar.JarFile;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.marketplace.runtime.RuntimeLayout;

@Service
public class ProjectVersionService {

    private final RuntimeLayout runtimeLayout;
    private final ProjectSettingsService settingsService;
    private final InstanceIdentityService identityService;
    private final ReleaseIdentity packagedIdentity;

    @Autowired
    public ProjectVersionService(RuntimeLayout runtimeLayout, ProjectSettingsService settingsService, InstanceIdentityService identityService) {
        this(runtimeLayout, settingsService, identityService, packagedArtifact());
    }

    ProjectVersionService(RuntimeLayout runtimeLayout, ProjectSettingsService settingsService, InstanceIdentityService identityService, Path packagedArtifact) {
        this.runtimeLayout = runtimeLayout;
        this.settingsService = settingsService;
        this.identityService = identityService;
        this.packagedIdentity = readPackagedIdentity(packagedArtifact);
    }

    public ProjectVersionInfo info() {
        ProjectSettings settings = settingsService.current();
        AutarkOsIdentity identity = identityService.current();
        return new ProjectVersionInfo(
                firstPresent(packagedIdentity.version(), System.getenv("AUTARK_OS_VERSION"), "0.0.1-SNAPSHOT"),
                firstPresent(packagedIdentity.buildSha(), System.getenv("AUTARK_OS_BUILD_SHA"), "development"),
                firstPresent(packagedIdentity.buildDate(), System.getenv("AUTARK_OS_BUILD_DATE"), "development"),
                firstPresent(System.getenv("AUTARK_OS_INSTALL_DIR"), "/opt/autark-os"),
                runtimeLayout.runtimeRoot().toString(),
                identity.instanceId(),
                identity.instanceSlug(),
                identity.runtimeRootHash(),
                backendJar(),
                settings.updateChannel(),
                "check_required",
                "Run autark-os update to check, review, and install a verified release with automatic health rollback.",
                Instant.now());
    }

    private String backendJar() {
        String classPath = System.getProperty("java.class.path", "");
        if (!classPath.isBlank() && classPath.endsWith(".jar")) {
            return Path.of(classPath).toAbsolutePath().normalize().toString();
        }
        return firstPresent(System.getenv("AUTARK_OS_BACKEND_JAR"), "/opt/autark-os/backend/autark-os-backend.jar");
    }

    private static Path packagedArtifact() {
        String classPath = System.getProperty("java.class.path", "");
        if (!classPath.isBlank() && !classPath.contains(File.pathSeparator)) {
            Path candidate = Path.of(classPath).toAbsolutePath().normalize();
            if (candidate.toString().endsWith(".jar") && Files.isRegularFile(candidate)) {
                return candidate;
            }
        }
        try {
            Path candidate = Path.of(ProjectVersionService.class.getProtectionDomain().getCodeSource().getLocation().toURI())
                    .toAbsolutePath()
                    .normalize();
            if (candidate.toString().endsWith(".jar") && Files.isRegularFile(candidate)) {
                return candidate;
            }
        } catch (Exception ignored) {
            // Development classpaths and nested class locations use environment
            // fallbacks instead of packaged manifest metadata.
        }
        return null;
    }

    private ReleaseIdentity readPackagedIdentity(Path artifact) {
        if (artifact == null) {
            return ReleaseIdentity.empty();
        }
        try (JarFile jar = new JarFile(artifact.toFile())) {
            Attributes attributes = jar.getManifest().getMainAttributes();
            return new ReleaseIdentity(
                    attributes.getValue("Implementation-Version"),
                    attributes.getValue("Autark-OS-Build-Sha"),
                    attributes.getValue("Autark-OS-Build-Date"));
        } catch (Exception ignored) {
            return ReleaseIdentity.empty();
        }
    }

    private String firstPresent(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private record ReleaseIdentity(String version, String buildSha, String buildDate) {
        private static ReleaseIdentity empty() {
            return new ReleaseIdentity("", "", "");
        }
    }
}

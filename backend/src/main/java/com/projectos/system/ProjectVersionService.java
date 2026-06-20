package com.projectos.system;

import java.nio.file.Path;
import java.time.Instant;

import org.springframework.stereotype.Service;

import com.projectos.marketplace.runtime.RuntimeLayout;

@Service
public class ProjectVersionService {

    private final RuntimeLayout runtimeLayout;
    private final ProjectSettingsService settingsService;

    public ProjectVersionService(RuntimeLayout runtimeLayout, ProjectSettingsService settingsService) {
        this.runtimeLayout = runtimeLayout;
        this.settingsService = settingsService;
    }

    public ProjectVersionInfo info() {
        ProjectSettings settings = settingsService.current();
        return new ProjectVersionInfo(
                firstPresent(System.getenv("PROJECT_OS_VERSION"), packageVersion(), "0.0.1-SNAPSHOT"),
                firstPresent(System.getenv("PROJECT_OS_BUILD_SHA"), "development"),
                firstPresent(System.getenv("PROJECT_OS_BUILD_DATE"), "development"),
                firstPresent(System.getenv("PROJECT_OS_INSTALL_DIR"), "/opt/project-os"),
                runtimeLayout.runtimeRoot().toString(),
                backendJar(),
                settings.updateChannel(),
                "unavailable",
                "Signed release artifacts are not available yet, so Project OS can show version metadata but cannot check for or install updates.",
                Instant.now());
    }

    private String backendJar() {
        String classPath = System.getProperty("java.class.path", "");
        if (!classPath.isBlank() && classPath.endsWith(".jar")) {
            return Path.of(classPath).toAbsolutePath().normalize().toString();
        }
        return firstPresent(System.getenv("PROJECT_OS_BACKEND_JAR"), "/opt/project-os/backend/project-os-backend.jar");
    }

    private String packageVersion() {
        Package pkg = ProjectVersionService.class.getPackage();
        return pkg == null ? "" : pkg.getImplementationVersion();
    }

    private String firstPresent(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }
}

package com.autarkos.system;

import java.io.IOException;
import java.util.List;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Fixed release scope shared with the browser; not a runtime feature-flag system. */
public final class BetaScope {

    public static final String INSTALL_UNAVAILABLE = "This app is not available for new installs in the controlled beta. Existing apps remain available in My Apps.";
    public static final String PRO_UNAVAILABLE = "New Pro activation and extension installation are deferred during the Core beta. Existing Pro status and removal remain available.";
    public static final String UPDATES_UNAVAILABLE = "Managed app updates are deferred during the controlled beta. Existing apps and recovery records are retained. Core updates remain available through autark-os update.";
    public static final Scope CURRENT = load();

    private BetaScope() {
    }

    public static boolean allowsInstall(String appId) {
        return CURRENT.apps().stream().anyMatch(app -> app.id().equals(appId));
    }

    public static void requireInstall(String appId) {
        if (!allowsInstall(appId)) {
            throw new UnavailableException(INSTALL_UNAVAILABLE);
        }
    }

    public static void requireProInstallation() {
        if (!CURRENT.proInstallationAvailable()) {
            throw new UnavailableException(PRO_UNAVAILABLE);
        }
    }

    private static Scope load() {
        try (var input = new ClassPathResource("beta-scope.json").getInputStream()) {
            return new ObjectMapper().readValue(input, Scope.class);
        } catch (IOException exception) {
            throw new IllegalStateException("The release scope could not be loaded.", exception);
        }
    }

    public record App(String id, String label, String detail) {
    }

    public static final class UnavailableException extends ResponseStatusException {
        public UnavailableException(String message) {
            super(HttpStatus.CONFLICT, message);
        }
    }

    public record Scope(String qualificationStatus, String primaryEnvironment, String installationRoute,
            String coreUpdateRoute, List<App> apps, boolean proInstallationAvailable,
            boolean managedAppUpdatesAvailable, boolean automaticRepairDefault) {
        public Scope {
            apps = List.copyOf(apps);
        }
    }
}

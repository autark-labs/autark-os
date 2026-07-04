package com.autarkos.host;

import java.util.List;
import java.util.Map;

import com.autarkos.apps.ApplicationState;

public final class HostModels {

    private HostModels() {
    }

    public record ActionResult(
            boolean ok,
            String severity,
            String title,
            String message,
            String resourceId,
            String nextAction,
            ApplicationState applicationState) {

        public ActionResult(
                boolean ok,
                String severity,
                String title,
                String message,
                String resourceId,
                String nextAction) {
            this(ok, severity, title, message, resourceId, nextAction, null);
        }

        public ActionResult withApplicationState(ApplicationState state) {
            return new ActionResult(ok, severity, title, message, resourceId, nextAction, state);
        }
    }

    public record HostDockerContainer(
            String name,
            String image,
            String status,
            Map<String, String> labels,
            String ports) {
    }

    public record ObservedServiceAction(
            String id,
            String label,
            String kind,
            String href,
            String method,
            boolean disabled,
            String reason) {
    }

    public record ObservedServiceAdoptionPlan(
            String serviceId,
            boolean available,
            String summary,
            List<String> containers,
            String catalogAppId,
            List<String> labelsToApply,
            boolean restartRequired,
            String dataPreservation,
            List<String> warnings,
            String disabledReason,
            String confirmationText,
            List<String> steps,
            List<String> blockedReasons) {
    }

    public record ObservedServiceAdoptionRequest(boolean confirmed, boolean takeControlConfirmed, String confirmation) {
    }

    public record ObservedServiceMatchRequest(String catalogAppId) {
    }

    public static final class ObservedServiceSource {
        public static final String DOCKER = "docker";
        public static final String MANUAL_URL = "manual_url";
        public static final String NETWORK = "network";
        public static final String AUTARK_OS_INSTALL = "autark_os_install";

        private ObservedServiceSource() {
        }
    }

    public static final class ObservedServiceStatus {
        public static final String MANAGED = "installed_managed";
        public static final String PINNED = "pinned_external";
        public static final String FOUND = "found_on_server";
        public static final String RECOVERABLE = "recoverable";
        public static final String OWNED_ELSEWHERE = "managed_elsewhere";
        public static final String CONFLICT = "blocked";
        public static final String FAILED_INSTALL = "failed_install";

        private ObservedServiceStatus() {
        }
    }
}

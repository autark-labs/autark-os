package com.autarkos.marketplace.install.models;

import java.time.Instant;
import java.util.List;

public final class AccessModels {

    private AccessModels() {
    }

    public record AccessDesiredState(
            String mode,
            String label,
            String localUrl,
            String privateUrl,
            Integer expectedLocalPort,
            String expectedProtocol,
            String privateAccessRequirement,
            boolean privateAccessRequired,
            boolean privateAccessRecommended) {
    }

    public record AccessObservedState(
            String localUrl,
            String privateUrl,
            Integer localPort,
            String protocol,
            String privateLinkStatus,
            Instant lastAccessCheckAt,
            Instant lastSuccessfulAccessAt,
            Instant lastRepairAttemptAt,
            String lastRepairStatus) {
    }

    public record AppAccessCheck(
            String appId,
            String url,
            String status,
            String message,
            Instant checkedAt) {

        public static AppAccessCheck notConfigured(String appId) {
            return new AppAccessCheck(appId, null, "not_configured", "No app link has been configured yet.", Instant.now());
        }

        public static AppAccessCheck reachable(String appId, String url) {
            return new AppAccessCheck(appId, url, "reachable", "App link is responding.", Instant.now());
        }

        public static AppAccessCheck unreachable(String appId, String url) {
            return new AppAccessCheck(appId, url, "unreachable", "App is running, but the link is not responding.", Instant.now());
        }
    }

    public record AppAccessRoute(
            String primaryOpenUrl,
            String localUrl,
            String privateUrl,
            String backendTargetUrl,
            String backendProtocol,
            Integer localPort,
            Integer privatePort,
            String privateLinkStatus) {
    }

    public record PrivateAccessReconciliationItem(
            String appId,
            String appName,
            String status,
            String message,
            String detail,
            String actionLabel,
            String expectedPrivateUrl,
            String actualPrivateUrl,
            Integer expectedPort,
            Integer actualPort,
            String target,
            Integer expectedLocalPort,
            Integer expectedHttpsPort,
            String storedPrivateUrl,
            String desiredMapping,
            List<String> liveMappings,
            String matchReason,
            Instant verifiedAt) {
    }

    public record PrivateAccessReconciliationReport(
            String status,
            String headline,
            String summary,
            List<PrivateAccessReconciliationItem> apps,
            List<PrivateAccessStaleMapping> staleMappings,
            Instant checkedAt) {
    }

    public record PrivateAccessStaleMapping(
            String id,
            String serviceName,
            String endpoint,
            Integer servePort,
            String target,
            Integer targetPort,
            String message,
            String detail,
            String actionLabel) {
    }
}

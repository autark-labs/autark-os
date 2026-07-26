package com.autarkos.extensions;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.autarkos.pro.agent.ProAgentClientException;
import com.autarkos.pro.agent.ProAgentClientRouter;
import com.autarkos.pro.audit.ProAuditEvent;
import com.autarkos.pro.audit.ProAuditEventType;
import com.autarkos.pro.audit.ProAuditService;
import com.autarkos.pro.entitlement.ProEntitlementService;
import com.autarkos.pro.entitlement.ProStatusResponse;
import com.autarkos.pro.snapshot.NormalizedHostSnapshotAssembler;

@Service
public final class ExtensionHostService {

    public static final String PRO_EXTENSION_ID = "autark-pro";

    private static final Pattern ASSET_NAME =
            Pattern.compile("^[a-zA-Z0-9._-]{1,128}$");
    private static final Pattern SURFACE_ID =
            Pattern.compile("^[a-z][a-z0-9.-]{1,127}$");
    private static final int STATE_SCHEMA_VERSION = 1;
    private static final Duration STATE_RETENTION = Duration.ofDays(7);
    private static final Set<String> HOSTED_EXTENSIONS =
            Set.of(PRO_EXTENSION_ID);

    private final ProAgentClientRouter agent;
    private final ProEntitlementService entitlements;
    private final NormalizedHostSnapshotAssembler snapshots;
    private final ExtensionStateStore state;
    private final ProAuditService audit;

    public ExtensionHostService(
            ProAgentClientRouter agent,
            ProEntitlementService entitlements,
            NormalizedHostSnapshotAssembler snapshots,
            ExtensionStateStore state,
            ProAuditService audit) {
        this.agent = Objects.requireNonNull(agent);
        this.entitlements = Objects.requireNonNull(entitlements);
        this.snapshots = Objects.requireNonNull(snapshots);
        this.state = Objects.requireNonNull(state);
        this.audit = Objects.requireNonNull(audit);
    }

    public ExtensionUiManifest manifest(String extensionId) {
        ActiveExtension active = requireActive(extensionId);
        ExtensionUiManifest manifest = call(agent::uiManifest);
        requireBoundManifest(manifest, active);
        return manifest;
    }

    public VerifiedAsset asset(String extensionId, String assetName) {
        if (assetName == null || !ASSET_NAME.matcher(assetName).matches()) {
            throw notFound();
        }
        ActiveExtension active = requireActive(extensionId);
        ExtensionUiManifest manifest = call(agent::uiManifest);
        requireBoundManifest(manifest, active);
        if (!assetName.equals(manifest.entrypoint())) {
            throw notFound();
        }
        byte[] contents = call(() -> agent.uiAsset(assetName));
        String digest = sha256(contents);
        if (!digest.equals(manifest.entrypointSha256())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "The installed extension entrypoint did not match its manifest.");
        }
        return new VerifiedAsset(contents, digest);
    }

    public synchronized ExtensionSurfaceResult render(
            String extensionId,
            String surface) {
        if (surface == null || !SURFACE_ID.matcher(surface).matches()) {
            throw notFound();
        }
        ActiveExtension active = requireActive(extensionId);
        ExtensionUiManifest manifest = call(agent::uiManifest);
        requireBoundManifest(manifest, active);
        if (!manifest.surfaces().contains(surface)) {
            throw notFound();
        }
        cleanupState(active);
        boolean resetState = state.hasLegacySurfaceState(
                active.extensionId(), active.digest());
        if (resetState) {
            auditStateReset(active, "legacy_surface_state");
            state.resetLegacySurfaceState(
                    active.extensionId(), active.digest());
        }
        ExtensionStateStore.ExtensionState previous =
                state.loadCanonical(
                        active.extensionId(), active.digest())
                        .orElse(null);
        if (previous != null
                && previous.schemaVersion() != STATE_SCHEMA_VERSION) {
            auditStateReset(active, "incompatible_state_schema");
            state.clearCanonical(active.extensionId(), active.digest());
            previous = null;
            resetState = true;
        }
        String continuation = previous == null
                ? null
                : previous.opaqueState();
        ExtensionSurfaceEnvelope response = call(() ->
                agent.renderSurface(
                        surface,
                        snapshots.assemble(),
                        continuation));
        if (!surface.equals(response.surface())
                || response.payload() == null
                || response.stateSchemaVersion() != STATE_SCHEMA_VERSION
                || !Set.of("new", "compatible", "reset")
                        .contains(response.stateCompatibility())) {
            throw incompatible();
        }
        if (response.continuationToken() != null) {
            state.saveCanonical(
                    active.extensionId(),
                    active.digest(),
                    response.stateSchemaVersion(),
                    response.continuationToken());
        } else if (previous != null) {
            state.clearCanonical(
                    active.extensionId(),
                    active.digest());
        }
        String compatibility = resetState
                ? "reset"
                : response.stateCompatibility();
        if ("reset".equals(response.stateCompatibility())
                && !resetState) {
            auditStateReset(active, "incompatible_state_schema");
        }
        return new ExtensionSurfaceResult(
                response.payload(),
                new ExtensionStateStatus(
                        response.stateSchemaVersion(),
                        compatibility));
    }

    public synchronized ExtensionRefreshResult refresh(
            String extensionId) {
        ActiveExtension active = requireActive(extensionId);
        cleanupState(active);
        ExtensionStateStore.ExtensionState previous =
                state.loadCanonical(
                        active.extensionId(),
                        active.digest())
                        .orElse(null);
        if (previous != null
                && previous.schemaVersion() != STATE_SCHEMA_VERSION) {
            auditStateReset(active, "incompatible_state_schema");
            state.clearCanonical(active.extensionId(), active.digest());
            previous = null;
        }
        String continuation = previous == null
                ? null
                : previous.opaqueState();
        var snapshot = snapshots.assemble();
        ExtensionRefreshResult result = call(() ->
                agent.refresh(snapshot, continuation));
        requireRefreshResult(result, snapshot.generatedAt());
        if (previous != null) {
            state.clearCanonical(
                    active.extensionId(),
                    active.digest());
        }
        return result;
    }

    public void requireRefreshAvailable(String extensionId) {
        requireActive(extensionId);
    }

    /**
     * Private browser modules can request only fixed CE-owned navigation pairs.
     * The rejected values are intentionally not recorded so a compromised
     * module cannot add browser-controlled content to a durable audit trail.
     */
    public void recordNavigationRejection(String extensionId) {
        ActiveExtension active = requireActive(extensionId);
        String digestPrefix = active.digest().substring(
                "sha256:".length(), 19);
        audit.recordRequired(new ProAuditEvent(
                "extension-navigation-rejected:" + digestPrefix,
                ProAuditEventType.EXTENSION_NAVIGATION_REJECTED,
                null,
                "autark-pro-extension",
                active.componentVersion(),
                active.digest(),
                null,
                null,
                "recorded",
                "unrecognized_navigation",
                null,
                null));
    }

    private ActiveExtension requireActive(String extensionId) {
        if (!HOSTED_EXTENSIONS.contains(extensionId)) {
            throw notFound();
        }
        ProStatusResponse status = entitlements.status();
        ProStatusResponse.ModuleStatus module = status.module();
        if (status.entitlement() == null
                || !status.entitlement().localUseAllowed()
                || module == null
                || module.activeDigest() == null
                || !"healthy".equals(module.health())) {
            throw notFound();
        }
        return new ActiveExtension(
                extensionId,
                module.activeDigest(),
                module.previousDigest(),
                module.componentVersion());
    }

    private void cleanupState(ActiveExtension active) {
        Set<String> retained = new HashSet<>();
        retained.add(active.digest());
        if (active.previousDigest() != null) {
            retained.add(active.previousDigest());
        }
        state.cleanupExpired(
                active.extensionId(),
                retained,
                Instant.now().minus(STATE_RETENTION));
    }

    private void auditStateReset(
            ActiveExtension active,
            String reasonCode) {
        String digestPrefix = active.digest().substring(
                "sha256:".length(), 19);
        audit.recordRequired(new ProAuditEvent(
                "extension-state-reset:" + digestPrefix,
                ProAuditEventType.EXTENSION_STATE_RESET,
                null,
                "autark-pro-extension",
                active.componentVersion(),
                active.digest(),
                null,
                null,
                "recorded",
                reasonCode,
                null,
                null));
    }

    private static void requireBoundManifest(
            ExtensionUiManifest manifest,
            ActiveExtension active) {
        if (manifest == null
                || !active.extensionId().equals(manifest.extensionId())
                || !Objects.equals(
                        active.componentVersion(),
                        manifest.componentVersion())) {
            throw incompatible();
        }
    }

    private static void requireRefreshResult(
            ExtensionRefreshResult result,
            Instant snapshotGeneratedAt) {
        if (result == null
                || !"1".equals(result.schemaVersion())
                || result.completedAt() == null
                || snapshotGeneratedAt == null
                || result.completedAt().isBefore(
                        snapshotGeneratedAt.minus(Duration.ofMinutes(5)))
                || result.completedAt().isAfter(
                        Instant.now().plus(Duration.ofMinutes(5)))
                || !Set.of("new", "compatible", "reset")
                        .contains(result.stateCompatibility())
                || result.activeFindingCount() < 0
                || result.activeFindingCount() > 100
                || !Set.of(
                        "none",
                        "info",
                        "low",
                        "medium",
                        "high",
                        "critical")
                        .contains(result.highestSeverity())) {
            throw incompatible();
        }
        ExtensionRefreshResult.Recommendation recommendation =
                result.recommendation();
        if (recommendation == null) {
            if (result.activeFindingCount() != 0
                    || !"none".equals(result.highestSeverity())) {
                throw incompatible();
            }
            return;
        }
        if (result.activeFindingCount() == 0
                || !"pro".equals(recommendation.routeId())
                || !"review-guardian".equals(
                        recommendation.actionId())
                || !"Review Guardian".equals(
                        recommendation.label())) {
            throw incompatible();
        }
    }

    private static String sha256(byte[] contents) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(contents);
            return "sha256:" + HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "The requested extension is not installed.");
    }

    private static ResponseStatusException incompatible() {
        return new ResponseStatusException(
                HttpStatus.CONFLICT,
                "The installed extension is not compatible with this Autark-OS release.");
    }

    private static <T> T call(ExtensionCall<T> operation) {
        try {
            return operation.run();
        } catch (ProAgentClientException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "The installed extension is unavailable.",
                    exception);
        }
    }

    @FunctionalInterface
    private interface ExtensionCall<T> {
        T run();
    }

    private record ActiveExtension(
            String extensionId,
            String digest,
            String previousDigest,
            String componentVersion) {
    }

    public record VerifiedAsset(byte[] contents, String digest) {

        public VerifiedAsset {
            contents = contents.clone();
        }

        @Override
        public byte[] contents() {
            return contents.clone();
        }
    }
}

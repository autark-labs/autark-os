package com.autarkos.extensions;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.autarkos.pro.agent.ProAgentClientException;
import com.autarkos.pro.agent.ProAgentClientRouter;
import com.autarkos.pro.entitlement.ProEntitlementService;
import com.autarkos.pro.entitlement.ProStatusResponse;
import com.autarkos.pro.snapshot.NormalizedHostSnapshotAssembler;
import com.fasterxml.jackson.databind.JsonNode;

@Service
public final class ExtensionHostService {

    public static final String PRO_EXTENSION_ID = "autark-pro";

    private static final Pattern ASSET_NAME =
            Pattern.compile("^[a-zA-Z0-9._-]{1,128}$");
    private static final Pattern SURFACE_ID =
            Pattern.compile("^[a-z][a-z0-9.-]{1,127}$");
    private static final Set<String> HOSTED_EXTENSIONS =
            Set.of(PRO_EXTENSION_ID);

    private final ProAgentClientRouter agent;
    private final ProEntitlementService entitlements;
    private final NormalizedHostSnapshotAssembler snapshots;
    private final ExtensionStateStore state;

    public ExtensionHostService(
            ProAgentClientRouter agent,
            ProEntitlementService entitlements,
            NormalizedHostSnapshotAssembler snapshots,
            ExtensionStateStore state) {
        this.agent = Objects.requireNonNull(agent);
        this.entitlements = Objects.requireNonNull(entitlements);
        this.snapshots = Objects.requireNonNull(snapshots);
        this.state = Objects.requireNonNull(state);
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

    public synchronized JsonNode render(
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
        state.clearOtherDigests(active.extensionId(), active.digest());
        String continuation = state.load(
                active.extensionId(), active.digest(), surface)
                .orElse(null);
        ExtensionSurfaceEnvelope response = call(() ->
                agent.renderSurface(
                        surface,
                        snapshots.assemble(),
                        continuation));
        if (!surface.equals(response.surface()) || response.payload() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "The installed extension returned an invalid surface.");
        }
        if (response.continuationToken() != null) {
            state.save(
                    active.extensionId(),
                    active.digest(),
                    surface,
                    response.continuationToken());
        }
        return response.payload();
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
                module.componentVersion());
    }

    private static void requireBoundManifest(
            ExtensionUiManifest manifest,
            ActiveExtension active) {
        if (manifest == null
                || !active.extensionId().equals(manifest.extensionId())
                || !Objects.equals(
                        active.componentVersion(),
                        manifest.componentVersion())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "The installed extension manifest did not match the active release.");
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

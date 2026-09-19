package com.autarkos.system;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.autarkos.host.DockerInventoryService;
import com.autarkos.host.DockerInventorySnapshot;
import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.marketplace.install.ManagedAppAttestationService;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.UpdateInventoryModels.ContainerIdentity;
import com.autarkos.system.UpdateInventoryModels.ManagedApp;
import com.autarkos.system.UpdateInventoryModels.Snapshot;
import com.autarkos.system.UpdateInventoryModels.Verification;
import com.autarkos.system.UpdateInventoryModels.Violation;

@Service
public class UpdateInventoryService {

    static final int LEGACY_SCHEMA_VERSION = 1;
    static final int SCHEMA_VERSION = 2;

    private final ManagedAppAttestationService managedApps;
    private final InstanceIdentityService identityService;
    private final DockerInventoryService dockerInventory;
    private final RuntimeLayout runtimeLayout;

    public UpdateInventoryService(
            ManagedAppAttestationService managedApps,
            InstanceIdentityService identityService,
            DockerInventoryService dockerInventory,
            RuntimeLayout runtimeLayout) {
        this.managedApps = managedApps;
        this.identityService = identityService;
        this.dockerInventory = dockerInventory;
        this.runtimeLayout = runtimeLayout;
    }

    public Snapshot capture() {
        AutarkOsIdentity identity = identityService.current();
        Snapshot snapshot = snapshot(identity, dockerInventory.requireFresh());
        requireUsableSnapshot(snapshot);
        return snapshot;
    }

    public Verification verify(Snapshot before) {
        requireUsableSnapshot(before);
        boolean legacyBaseline = before.schemaVersion() == LEGACY_SCHEMA_VERSION;
        AutarkOsIdentity identity = identityService.current();
        DockerInventorySnapshot inventory = dockerInventory.requireFresh();
        Snapshot after = snapshot(identity, inventory);
        Map<String, ManagedApp> currentById = new LinkedHashMap<>();
        for (ManagedApp app : after.managedApps()) {
            currentById.put(app.catalogAppId(), app);
        }

        List<Violation> violations = new ArrayList<>();
        verifyInstallationIdentity(before, after, legacyBaseline, violations);
        for (ManagedApp previous : before.managedApps()) {
            verifyApp(previous, currentById.get(previous.catalogAppId()), legacyBaseline, violations);
        }

        boolean safe = violations.isEmpty();
        String summary = safe
                ? "Verified that " + before.managedApps().size() + " managed app(s) retained their complete identity after the update."
                : "Update continuity verification found " + violations.size() + " managed-app identity violation(s).";
        return new Verification(
                SCHEMA_VERSION,
                Instant.now(),
                safe,
                summary,
                before,
                after,
                List.copyOf(violations));
    }

    private Snapshot snapshot(AutarkOsIdentity identity, DockerInventorySnapshot inventory) {
        List<ManagedApp> attestations = managedApps.managedAttestations().stream()
                .map(attestation -> managedApp(attestation, inventory))
                .sorted(Comparator.comparing(ManagedApp::catalogAppId))
                .toList();
        return new Snapshot(
                SCHEMA_VERSION,
                Instant.now(),
                value(identity.instanceId()),
                value(identity.runtimeRoot()),
                value(identity.runtimeRootHash()),
                sha256(runtimeLayout.identityPath()),
                attestations);
    }

    private ManagedApp managedApp(
            ManagedAppAttestationService.Result attestation,
            DockerInventorySnapshot inventory) {
        var app = attestation.app();
        var ownership = attestation.ownership();
        var metadata = attestation.runtimeMetadata();
        Path runtimePath = Path.of(app.runtimePath()).toAbsolutePath().normalize();
        return new ManagedApp(
                value(app.appId()),
                value(ownership.appInstanceId()),
                value(ownership.autarkOsInstanceId()),
                runtimePath.toString(),
                value(app.composeProject()),
                app.installedAt(),
                ownership.createdAt(),
                metadata.createdAt(),
                value(metadata.manifestVersion()),
                sha256(runtimePath.resolve("manifest.yaml")),
                sha256(runtimePath.resolve("compose.yaml")),
                containerIdentities(app.appId(), ownership.appInstanceId(), app.composeProject(), inventory));
    }

    private List<ContainerIdentity> containerIdentities(
            String appId,
            String appInstanceId,
            String composeProject,
            DockerInventorySnapshot inventory) {
        return inventory.containers().stream()
                .filter(container -> appId.equals(value(container.classification().appId()))
                        || appInstanceId.equals(value(container.classification().appInstanceId()))
                        || composeProject.equals(value(container.classification().composeProject())))
                .map(container -> new ContainerIdentity(
                        value(container.observed().name()),
                        container.classification().ownership().name().toLowerCase(java.util.Locale.ROOT),
                        value(container.classification().appInstanceId()),
                        value(container.observed().labels().get(DockerOwnershipService.INSTANCE_ID)),
                        value(container.observed().labels().get(DockerOwnershipService.RUNTIME_ROOT_HASH)),
                        value(container.classification().composeProject())))
                .sorted(Comparator.comparing(ContainerIdentity::name))
                .toList();
    }

    private void verifyInstallationIdentity(
            Snapshot before,
            Snapshot after,
            boolean legacyBaseline,
            List<Violation> violations) {
        compare("", "owner_instance_changed", before.ownerInstanceId(), after.ownerInstanceId(),
                "The Autark-OS owner instance changed during the update.", violations);
        compare("", "runtime_root_changed", before.runtimeRoot(), after.runtimeRoot(),
                "The managed runtime root changed during the update.", violations);
        compare("", "runtime_root_hash_changed", before.runtimeRootHash(), after.runtimeRootHash(),
                "The managed runtime-root identity changed during the update.", violations);
        if (!legacyBaseline) {
            compare("", "identity_file_changed", before.identityFileSha256(), after.identityFileSha256(),
                    "The installation identity file changed during the update.", violations);
        }
    }

    private void verifyApp(
            ManagedApp previous,
            ManagedApp current,
            boolean legacyBaseline,
            List<Violation> violations) {
        if (current == null) {
            ManagedAppAttestationService.Result attestation = managedApps.attest(previous.catalogAppId());
            String code = blank(attestation.reasonCode()) ? "managed_attestation_lost" : attestation.reasonCode();
            violations.add(new Violation(
                    previous.catalogAppId(),
                    code,
                    "managed",
                    value(attestation.reasonCode()),
                    attestation.message()));
        } else {
            String appId = previous.catalogAppId();
            compare(appId, "catalog_identity_changed", previous.catalogAppId(), current.catalogAppId(),
                    "The saved catalog identity changed.", violations);
            compare(appId, "app_instance_changed", previous.appInstanceId(), current.appInstanceId(),
                    "The app-instance identity changed.", violations);
            compare(appId, "owner_instance_changed", previous.ownerInstanceId(), current.ownerInstanceId(),
                    "The app ownership record now belongs to a different Autark-OS instance.", violations);
            compare(appId, "runtime_path_changed", previous.runtimePath(), current.runtimePath(),
                    "The managed runtime path changed.", violations);
            compare(appId, "compose_project_changed", previous.composeProject(), current.composeProject(),
                    "The managed Compose project changed.", violations);
            if (legacyBaseline) {
                return;
            }
            compare(appId, "registration_replaced", instant(previous.registrationInstalledAt()), instant(current.registrationInstalledAt()),
                    "The installed-app registration was replaced.", violations);
            compare(appId, "ownership_record_replaced", instant(previous.ownershipCreatedAt()), instant(current.ownershipCreatedAt()),
                    "The ownership record was replaced.", violations);
            compare(appId, "runtime_metadata_replaced", instant(previous.runtimeMetadataCreatedAt()), instant(current.runtimeMetadataCreatedAt()),
                    "The runtime metadata identity was replaced.", violations);
            compare(appId, "manifest_version_changed", previous.manifestVersion(), current.manifestVersion(),
                    "The saved app release version changed during the core update.", violations);
            compare(appId, "saved_manifest_changed", previous.savedManifestSha256(), current.savedManifestSha256(),
                    "The saved app release manifest changed during the core update.", violations);
            compare(appId, "compose_configuration_changed", previous.composeSha256(), current.composeSha256(),
                    "The app Compose configuration changed during the core update.", violations);
            if (!previous.containers().equals(current.containers())) {
                violations.add(new Violation(
                        appId,
                        "container_ownership_changed",
                        previous.containers().toString(),
                        current.containers().toString(),
                        "The app's container ownership identities changed during the core update."));
            }
        }
    }

    private void compare(
            String appId,
            String code,
            String expected,
            String actual,
            String message,
            List<Violation> violations) {
        if (!value(expected).equals(value(actual))) {
            violations.add(new Violation(appId, code, value(expected), value(actual), message));
        }
    }

    private void requireUsableSnapshot(Snapshot snapshot) {
        if (snapshot == null
                || snapshot.managedApps() == null
                || blank(snapshot.ownerInstanceId())
                || blank(snapshot.runtimeRoot())
                || blank(snapshot.runtimeRootHash())
                || (snapshot.schemaVersion() != LEGACY_SCHEMA_VERSION && snapshot.schemaVersion() != SCHEMA_VERSION)) {
            throw new IllegalArgumentException("The pre-update managed-app inventory is missing or unsupported.");
        }
        boolean legacyBaseline = snapshot.schemaVersion() == LEGACY_SCHEMA_VERSION;
        if (!legacyBaseline && blank(snapshot.identityFileSha256())) {
            throw new IllegalArgumentException("The pre-update managed-app inventory is missing or unsupported.");
        }
        java.util.Set<String> appIds = new java.util.HashSet<>();
        for (ManagedApp app : snapshot.managedApps()) {
            boolean usable = legacyBaseline
                    ? usableLegacyManagedApp(snapshot, app)
                    : usableManagedApp(snapshot, app);
            if (!usable || !appIds.add(app.catalogAppId())) {
                throw new IllegalArgumentException("The pre-update managed-app inventory contains an invalid attestation.");
            }
        }
    }

    private boolean usableLegacyManagedApp(Snapshot snapshot, ManagedApp app) {
        return app != null
                && !blank(app.catalogAppId())
                && !blank(app.appInstanceId())
                && snapshot.ownerInstanceId().equals(app.ownerInstanceId())
                && !blank(app.runtimePath())
                && !blank(app.composeProject());
    }

    private boolean usableManagedApp(Snapshot snapshot, ManagedApp app) {
        if (app == null
                || blank(app.catalogAppId())
                || blank(app.appInstanceId())
                || !snapshot.ownerInstanceId().equals(app.ownerInstanceId())
                || blank(app.runtimePath())
                || blank(app.composeProject())
                || app.registrationInstalledAt() == null
                || app.ownershipCreatedAt() == null
                || app.runtimeMetadataCreatedAt() == null
                || blank(app.manifestVersion())
                || blank(app.savedManifestSha256())
                || blank(app.composeSha256())
                || app.containers() == null) {
            return false;
        }
        for (ContainerIdentity container : app.containers()) {
            if (container == null
                    || blank(container.name())
                    || !"owned".equals(container.ownershipState())
                    || !app.appInstanceId().equals(container.appInstanceId())
                    || !app.ownerInstanceId().equals(container.ownerInstanceId())
                    || !snapshot.runtimeRootHash().equals(container.runtimeRootHash())
                    || !app.composeProject().equals(container.composeProject())) {
                return false;
            }
        }
        return true;
    }

    private String sha256(Path path) {
        if (path == null || !Files.isRegularFile(path)) {
            return "";
        }
        try {
            return "sha256:" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path)));
        } catch (IOException | NoSuchAlgorithmException exception) {
            return "";
        }
    }

    private String instant(Instant value) {
        return value == null ? "" : value.toString();
    }

    private String value(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }
}

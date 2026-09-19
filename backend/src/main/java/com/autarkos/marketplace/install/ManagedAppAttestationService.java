package com.autarkos.marketplace.install;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.springframework.stereotype.Service;

import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.AutarkOsIdentity;

@Service
public class ManagedAppAttestationService {

    /** The complete answer to whether Autark-OS may manage an app. */
    public record Result(
            boolean managed,
            String reasonCode,
            String message,
            InstalledApp app,
            RuntimeModels.InstalledAppOwnershipMetadata ownership,
            RuntimeModels.AppRuntimeMetadata runtimeMetadata) {

        private static Result managed(
                InstalledApp app,
                RuntimeModels.InstalledAppOwnershipMetadata ownership,
                RuntimeModels.AppRuntimeMetadata runtimeMetadata) {
            return new Result(true, "managed", "Autark-OS has the complete managed app contract.",
                    app, ownership, runtimeMetadata);
        }

        private static Result failed(String code, String message, InstalledApp app) {
            return new Result(false, code, message, app, null, null);
        }
    }

    private final InstalledAppRepository repository;
    private final RuntimeLayout runtimeLayout;
    private final DockerOwnershipService dockerOwnership;
    private final AppRuntimeMetadataReader runtimeMetadataReader;
    private final ManagedStorageContractService storageContracts;

    public ManagedAppAttestationService(
            InstalledAppRepository repository,
            RuntimeLayout runtimeLayout,
            DockerOwnershipService dockerOwnership,
            AppRuntimeMetadataReader runtimeMetadataReader,
            ManagedStorageContractService storageContracts) {
        this.repository = repository;
        this.runtimeLayout = runtimeLayout;
        this.dockerOwnership = dockerOwnership;
        this.runtimeMetadataReader = runtimeMetadataReader;
        this.storageContracts = storageContracts;
    }

    public Result attest(String appId) {
        InstalledApp app = repository.findAppById(appId).orElse(null);
        return app == null
                ? Result.failed("registration_missing", "The managed app registration is missing.", null)
                : attest(app);
    }

    public Result attest(InstalledApp app) {
        if (app == null) {
            return Result.failed("registration_missing", "The managed app registration is missing.", null);
        }
        RuntimeModels.InstalledAppOwnershipMetadata ownership = repository.ownershipFor(app.appId()).orElse(null);
        if (ownership == null) {
            return failed("ownership_missing", "The app ownership record is missing.", app);
        }
        if (!"owned".equalsIgnoreCase(ownership.ownershipStatus())) {
            return failed("ownership_not_managed", "The app ownership record does not belong to this installation.", app);
        }
        if (blank(ownership.appInstanceId()) || blank(ownership.catalogAppId()) || blank(ownership.autarkOsInstanceId())) {
            return failed("ownership_incomplete", "The app ownership record is incomplete.", app);
        }
        if (!app.appId().equals(ownership.catalogAppId())) {
            return failed("catalog_identity_mismatch", "The app registration and ownership record identify different catalog apps.", app);
        }

        AutarkOsIdentity identity = dockerOwnership.currentIdentity();
        if (!identity.instanceId().equals(ownership.autarkOsInstanceId())) {
            return failed("owner_instance_mismatch", "The app belongs to another Autark-OS installation.", app);
        }

        Path expectedRoot = runtimeLayout.appRoot(app.appId()).toAbsolutePath().normalize();
        Path registeredRoot = path(app.runtimePath());
        Path ownershipRoot = path(ownership.runtimePathOrHash());
        if (registeredRoot == null || ownershipRoot == null
                || !expectedRoot.equals(registeredRoot) || !expectedRoot.equals(ownershipRoot)) {
            return failed("runtime_path_mismatch", "The app runtime folder does not match its managed registration.", app);
        }
        if (blank(app.composeProject())) {
            return failed("compose_project_missing", "The app Compose project is missing from its registration.", app);
        }
        if (!AppRuntimeFiles.isComposeFile(expectedRoot.resolve("compose.yaml"))) {
            return failed("compose_missing", "The original Compose configuration is missing.", app);
        }
        if (!Files.isRegularFile(expectedRoot.resolve("manifest.yaml"))) {
            return failed("release_manifest_missing", "The saved app release manifest is missing.", app);
        }

        RuntimeModels.AppRuntimeMetadata runtimeMetadata = runtimeMetadataReader.read(expectedRoot).orElse(null);
        if (runtimeMetadata == null) {
            return failed("runtime_metadata_missing", "The app runtime metadata is missing or unreadable.", app);
        }
        if (!app.appId().equals(runtimeMetadata.catalogAppId())
                || !ownership.appInstanceId().equals(runtimeMetadata.appInstanceId())
                || !identity.instanceId().equals(runtimeMetadata.instanceId())
                || !app.composeProject().equals(runtimeMetadata.composeProject())) {
            return failed("runtime_identity_mismatch", "The app runtime metadata does not match its managed identity.", app);
        }
        try {
            storageContracts.require(app, runtimeMetadata, false);
        } catch (InstallationException exception) {
            return failed("durable_storage_unproven", exception.getMessage(), app);
        }
        return Result.managed(app, ownership, runtimeMetadata);
    }

    public List<InstalledApp> managedApps() {
        return managedAttestations().stream().map(Result::app).toList();
    }

    public List<Result> managedAttestations() {
        return repository.findAllApps().stream()
                .map(this::attest)
                .filter(Result::managed)
                .toList();
    }

    public InstalledApp requireManaged(String appId, String action) {
        Result attestation = attest(appId);
        if (!attestation.managed()) {
            String appName = attestation.app() == null ? "This app" : attestation.app().appName();
            throw new InstallationException(appName + " is not fully managed, so Autark-OS will not " + action
                    + " it. " + attestation.message());
        }
        return attestation.app();
    }

    public ManagedStorageContractService.Contract durableStorage(InstalledApp app, boolean verifyLive) {
        Result attestation = requireAttestation(app);
        return storageContracts.require(attestation.app(), attestation.runtimeMetadata(), verifyLive);
    }

    private Result requireAttestation(InstalledApp app) {
        Result attestation = attest(app);
        if (!attestation.managed()) {
            throw new InstallationException(attestation.message());
        }
        return attestation;
    }

    private Result failed(String code, String message, InstalledApp app) {
        return Result.failed(code, message, app);
    }

    private Path path(String value) {
        try {
            return blank(value) ? null : Path.of(value).toAbsolutePath().normalize();
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }
}

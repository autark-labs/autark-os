package com.autarkos.pro;

import java.time.Instant;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.pro.models.ProModels;
import com.autarkos.pro.models.ProRemoteModels;
import com.autarkos.system.ProjectVersionService;

@Service
public class ProService {

    private final ProSettingsRepository repository;
    private final Supplier<Instant> clock;
    private final boolean remoteApiConfigured;
    private final ProRemoteClient remoteClient;
    private final Supplier<String> versionSupplier;
    private final ProHeartbeatPayloadBuilder heartbeatPayloadBuilder;

    @Autowired
    public ProService(
            ProSettingsRepository repository,
            ProProperties properties,
            ProRemoteClient remoteClient,
            ProjectVersionService versionService,
            ProHeartbeatPayloadBuilder heartbeatPayloadBuilder) {
        this(repository, Instant::now, properties.remoteApiConfigured(), remoteClient, () -> versionService.info().version(), heartbeatPayloadBuilder);
    }

    ProService(ProSettingsRepository repository, Supplier<Instant> clock, boolean remoteApiConfigured) {
        this(repository, clock, remoteApiConfigured, new MockProRemoteClient(), () -> "0.0.1-SNAPSHOT");
    }

    ProService(
            ProSettingsRepository repository,
            Supplier<Instant> clock,
            boolean remoteApiConfigured,
            ProRemoteClient remoteClient,
            Supplier<String> versionSupplier) {
        this(repository, clock, remoteApiConfigured, remoteClient, versionSupplier, ProHeartbeatPayloadBuilder.minimal(repository, clock, versionSupplier));
    }

    ProService(
            ProSettingsRepository repository,
            Supplier<Instant> clock,
            boolean remoteApiConfigured,
            ProRemoteClient remoteClient,
            Supplier<String> versionSupplier,
            ProHeartbeatPayloadBuilder heartbeatPayloadBuilder) {
        this.repository = repository;
        this.clock = clock;
        this.remoteApiConfigured = remoteApiConfigured;
        this.remoteClient = remoteClient;
        this.versionSupplier = versionSupplier;
        this.heartbeatPayloadBuilder = heartbeatPayloadBuilder;
    }

    public ProModels.ProStatus status() {
        ProModels.ProSettings settings = repository.settings()
                .orElseGet(() -> ProModels.ProSettings.defaults(clock.get()));
        return ProModels.ProStatus.from(settings, remoteApiConfigured, null);
    }

    public ProModels.ProStatus registerInstall() {
        ProModels.ProSettings current = repository.settings()
                .orElseGet(() -> ProModels.ProSettings.defaults(clock.get()));
        if (hasText(current.installId())) {
            return ProModels.ProStatus.from(current, remoteApiConfigured, null);
        }

        String version = firstPresent(versionSupplier.get(), "0.0.1-SNAPSHOT");
        ProRemoteModels.RegisterInstallResponse response = remoteClient.registerInstall(new ProRemoteModels.RegisterInstallRequest(
                "Autark-OS",
                version,
                version,
                platform(),
                null));
        Instant now = clock.get();
        ProModels.ProSettings registered = new ProModels.ProSettings(
                true,
                firstPresent(current.mode(), ProModels.Mode.FREE),
                response.installId(),
                response.installToken(),
                current.accountLinked(),
                current.accountEmail(),
                current.plan(),
                firstPresent(current.entitlementStatus(), ProModels.EntitlementStatus.NONE),
                current.entitlementExpiresAt(),
                current.healthReportingEnabled(),
                current.alertsEnabled(),
                current.proFeedEnabled(),
                current.configSnapshotEnabled(),
                current.lastHeartbeatAt(),
                current.lastHeartbeatResult(),
                current.lastEntitlementCheckAt(),
                current.lastFeedSyncAt(),
                current.createdAt() == null ? now : current.createdAt(),
                now);
        repository.saveSettings(registered);
        return ProModels.ProStatus.from(registered, remoteApiConfigured, null);
    }

    public ProModels.ProStatus redeemLicense(String licenseCode) {
        String trimmedLicenseCode = licenseCode == null ? "" : licenseCode.trim();
        if (!hasText(trimmedLicenseCode)) {
            throw new ProRemoteException("Enter a license code before activating Autark Pro.");
        }

        ProModels.ProSettings current = repository.settings()
                .orElseGet(() -> ProModels.ProSettings.defaults(clock.get()));
        if (!hasText(current.installId())) {
            if (remoteApiConfigured) {
                throw new ProRemoteException("Register this Autark-OS install before redeeming a Pro license.");
            }
            registerInstall();
            current = repository.settings()
                    .orElseGet(() -> ProModels.ProSettings.defaults(clock.get()));
        }

        ProRemoteModels.RedeemLicenseResponse response = remoteClient.redeemLicense(new ProRemoteModels.RedeemLicenseRequest(
                current.installId(),
                trimmedLicenseCode));
        if (!"active".equalsIgnoreCase(response.entitlementStatus())) {
            String detail = firstPresent(response.userMessage(), "Check the code and try again.");
            throw new ProRemoteException("Autark Pro could not activate that license. " + detail);
        }

        Instant now = clock.get();
        ProModels.ProSettings activated = new ProModels.ProSettings(
                true,
                "accountless",
                current.installId(),
                current.installTokenProtected(),
                current.accountLinked(),
                current.accountEmail(),
                response.plan(),
                response.entitlementStatus(),
                response.entitlementExpiresAt(),
                current.healthReportingEnabled(),
                current.alertsEnabled(),
                current.proFeedEnabled(),
                current.configSnapshotEnabled(),
                current.lastHeartbeatAt(),
                current.lastHeartbeatResult(),
                now,
                current.lastFeedSyncAt(),
                current.createdAt() == null ? now : current.createdAt(),
                now);
        repository.saveSettings(activated);
        return ProModels.ProStatus.from(activated, remoteApiConfigured, null);
    }

    public ProModels.ProPrivacyPayloadPreview privacyPayloadPreview() {
        return heartbeatPayloadBuilder.preview();
    }

    public ProModels.ProStatus sendHeartbeatNow() {
        ProModels.ProSettings current = repository.settings()
                .orElseGet(() -> ProModels.ProSettings.defaults(clock.get()));
        if (!hasText(current.installId())) {
            throw new ProRemoteException("Register this Autark-OS install before sending a Pro heartbeat.");
        }

        ProModels.ProPrivacyPayloadPreview preview = heartbeatPayloadBuilder.preview();
        try {
            ProRemoteModels.HeartbeatResponse response = remoteClient.submitHeartbeat(new ProRemoteModels.HeartbeatRequest(
                    current.installId(),
                    preview.generatedAt(),
                    preview.payload()));
            Instant now = clock.get();
            Instant heartbeatAt = response.receivedAt() == null ? now : response.receivedAt();
            ProModels.ProSettings updated = withHeartbeatResult(
                    current,
                    heartbeatAt,
                    firstPresent(response.result(), response.userMessage(), "accepted"),
                    now);
            repository.saveSettings(updated);
            return ProModels.ProStatus.from(updated, remoteApiConfigured, null);
        } catch (ProRemoteException exception) {
            Instant now = clock.get();
            ProModels.ProSettings failed = withHeartbeatResult(
                    current,
                    now,
                    "failed: " + firstPresent(exception.getMessage(), "Autark Pro heartbeat failed."),
                    now);
            repository.saveSettings(failed);
            throw exception;
        }
    }

    private static ProModels.ProSettings withHeartbeatResult(
            ProModels.ProSettings current,
            Instant lastHeartbeatAt,
            String lastHeartbeatResult,
            Instant updatedAt) {
        return new ProModels.ProSettings(
                current.enabled(),
                current.mode(),
                current.installId(),
                current.installTokenProtected(),
                current.accountLinked(),
                current.accountEmail(),
                current.plan(),
                current.entitlementStatus(),
                current.entitlementExpiresAt(),
                current.healthReportingEnabled(),
                current.alertsEnabled(),
                current.proFeedEnabled(),
                current.configSnapshotEnabled(),
                lastHeartbeatAt,
                lastHeartbeatResult,
                current.lastEntitlementCheckAt(),
                current.lastFeedSyncAt(),
                current.createdAt() == null ? updatedAt : current.createdAt(),
                updatedAt);
    }

    private static String platform() {
        return firstPresent(System.getProperty("os.name"), "unknown")
                + "-"
                + firstPresent(System.getProperty("os.arch"), "unknown");
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static String firstPresent(String... values) {
        for (String value : values) {
            if (hasText(value)) {
                return value;
            }
        }
        return "";
    }
}

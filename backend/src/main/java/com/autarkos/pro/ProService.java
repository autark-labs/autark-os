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

    @Autowired
    public ProService(
            ProSettingsRepository repository,
            ProProperties properties,
            ProRemoteClient remoteClient,
            ProjectVersionService versionService) {
        this(repository, Instant::now, properties.remoteApiConfigured(), remoteClient, () -> versionService.info().version());
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
        this.repository = repository;
        this.clock = clock;
        this.remoteApiConfigured = remoteApiConfigured;
        this.remoteClient = remoteClient;
        this.versionSupplier = versionSupplier;
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

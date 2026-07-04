package com.autarkos.marketplace.install;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.autarkos.apps.ApplicationState;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;

class AppGuardianServiceTests {

    @Test
    void scheduledGuardianReadsCachedHealthWithoutLiveProbe() {
        InstalledAppRepository repository = mock(InstalledAppRepository.class);
        AppLifecycleService lifecycleService = mock(AppLifecycleService.class);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        InstalledApp app = new InstalledApp(
                "vaultwarden",
                "Vaultwarden",
                "Ready",
                "/runtime/apps/vaultwarden",
                "autark-os-vaultwarden",
                "http://localhost:8090",
                Instant.parse("2026-06-21T12:00:00Z"));
        when(repository.findAllApps()).thenReturn(List.of(app));
        when(repository.settingsFor("vaultwarden")).thenReturn(Optional.of(new InstallModels.InstallSettings(
                "http://localhost:8090",
                null,
                false,
                Map.of(),
                InstallModels.BackupPolicy.defaults(),
                "local",
                "optional",
                8090,
                "http",
                null,
                null,
                null,
                null,
                true)));
        when(applicationStateService.snapshot()).thenReturn(applicationStateWith(runtimeView("vaultwarden", health("Ready"))));
        AppGuardianService guardian = new AppGuardianService(repository, lifecycleService, true, null, null, null, applicationStateService);

        guardian.inspectAndRepair();

        verify(lifecycleService, never()).healthSnapshot("vaultwarden");
        verify(lifecycleService, never()).repair("vaultwarden", true);
    }

    private ApplicationState applicationStateWith(AppRuntimeView app) {
        return new ApplicationState(
                List.of(),
                List.of(app),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                Instant.parse("2026-06-21T12:00:00Z"));
    }

    private AppRuntimeView runtimeView(String appId, AppHealthSnapshot health) {
        return new AppRuntimeView(
                appId,
                "Vaultwarden",
                "Security",
                "Passwords",
                "1.0.0",
                "",
                health.status(),
                "running",
                "healthy",
                "/runtime/apps/" + appId,
                "autark-os-" + appId,
                "http://localhost:8090",
                null,
                null,
                null,
                Instant.parse("2026-06-21T12:00:00Z"),
                "Backups disabled",
                null,
                RuntimeModels.AppTelemetry.unavailable(),
                health,
                null,
                null,
                List.of(),
                List.of());
    }

    private AppHealthSnapshot health(String status) {
        return new AppHealthSnapshot(
                "vaultwarden",
                status,
                status,
                "Cached health",
                "Ready",
                "reachable",
                "not_configured",
                false,
                Instant.parse("2026-06-21T12:00:00Z"));
    }
}

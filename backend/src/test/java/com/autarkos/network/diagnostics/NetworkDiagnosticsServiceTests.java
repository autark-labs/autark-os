package com.autarkos.network.diagnostics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.autarkos.apps.ApplicationStateService;
import com.autarkos.marketplace.install.PrivateAccessReconciliationService;
import com.autarkos.marketplace.install.models.AccessModels;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.network.tailscale.TailscaleStatus;

class NetworkDiagnosticsServiceTests {
    @Test
    void deliberateLanOnlyUseDoesNotCreateAnOptionalTailscaleWarning() {
        var tailscale = mock(TailscaleService.class);
        when(tailscale.status()).thenReturn(TailscaleStatus.notInstalled());
        when(tailscale.devices()).thenReturn(List.of());
        var reconciliation = mock(PrivateAccessReconciliationService.class);
        when(reconciliation.report()).thenReturn(new AccessModels.PrivateAccessReconciliationReport(
                "healthy", "No private apps", "", List.of(), List.of(), Instant.now()));
        var service = new NetworkDiagnosticsService(tailscale, mock(ApplicationStateService.class), reconciliation);

        var report = service.report();

        assertThat(report.status()).isEqualTo("healthy");
        assertThat(report.headline()).isEqualTo("Network status");
        assertThat(report.checks()).noneMatch(check -> "warning".equals(check.status()));
        when(tailscale.devices()).thenThrow(new IllegalStateException("Device evidence unavailable"));
        assertThatThrownBy(service::report).hasMessageContaining("Device evidence unavailable");
    }
}

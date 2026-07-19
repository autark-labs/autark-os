package com.autarkos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.autarkos.marketplace.install.AppUpdateService;

class AppUpdateCapabilityTests {

    @Test
    void standaloneCompatibilityStubStaysExplicitlyUnavailableOutsideTheConfiguredBackend() {
        var capability = new AppUpdateService().capability();

        assertThat(capability.available()).isFalse();
        assertThat(capability.status()).isEqualTo("unavailable");
        assertThat(capability.reasonCode()).isEqualTo("managed_updates_not_configured");
        assertThat(capability.summary()).contains("not configured", "Diagnostics");
    }
}

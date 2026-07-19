package com.autarkos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.autarkos.marketplace.install.AppUpdateService;

class AppUpdateCapabilityTests {

    @Test
    void standaloneCompatibilityStubStaysExplicitlyUnavailableOutsideTheConfiguredBackend() {
        var capability = new AppUpdateService().capability();

        assertThat(capability.available()).isFalse();
        assertThat(capability.status()).isEqualTo("unsupported");
        assertThat(capability.reasonCode()).isEqualTo("settings_preserving_updates_not_implemented");
        assertThat(capability.summary()).contains("saved settings", "secrets", "reversible update job");
    }
}

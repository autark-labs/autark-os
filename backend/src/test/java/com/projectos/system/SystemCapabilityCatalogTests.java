package com.projectos.system;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SystemCapabilityCatalogTests {

    @Test
    void exposesStableCapabilityIdsForSetupDoctorAndSupport() {
        assertThat(SystemCapabilityCatalog.DOCKER).isEqualTo("docker");
        assertThat(SystemCapabilityCatalog.TAILSCALE).isEqualTo("tailscale");
        assertThat(SystemCapabilityCatalog.TAILSCALE_OPERATOR).isEqualTo("tailscale-operator");
        assertThat(SystemCapabilityCatalog.RUNTIME_ROOT).isEqualTo("runtime-root");
        assertThat(SystemCapabilityCatalog.SERVICE_USER).isEqualTo("service-user");
        assertThat(SystemCapabilityCatalog.SYSTEMD).isEqualTo("systemd");
    }

    @Test
    void centralizesReadinessGroupsAndSupportRoutes() {
        assertThat(SystemCapabilityCatalog.APP_INSTALL_CHECKS)
                .containsExactly(
                        SystemCapabilityCatalog.DOCKER,
                        SystemCapabilityCatalog.SERVICE_USER,
                        SystemCapabilityCatalog.FILEOPS);
        assertThat(SystemCapabilityCatalog.PRIVATE_ACCESS_CHECKS)
                .containsExactly(SystemCapabilityCatalog.TAILSCALE, SystemCapabilityCatalog.TAILSCALE_OPERATOR);

        assertThat(SystemCapabilityCatalog.supportRoute(SystemCapabilityCatalog.DOCKER)).isEqualTo("/settings");
        assertThat(SystemCapabilityCatalog.supportRoute(SystemCapabilityCatalog.TAILSCALE)).isEqualTo("/network");
        assertThat(SystemCapabilityCatalog.supportRoute(SystemCapabilityCatalog.TAILSCALE_OPERATOR)).isEqualTo("/network");
        assertThat(SystemCapabilityCatalog.supportRoute(SystemCapabilityCatalog.BACKUP_DESTINATION)).isEqualTo("/backups");
    }
}

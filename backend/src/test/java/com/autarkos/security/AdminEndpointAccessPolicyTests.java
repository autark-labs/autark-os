package com.autarkos.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.autarkos.security.AdminEndpointAccessPolicy.AccessMode;

class AdminEndpointAccessPolicyTests {

    private final AdminEndpointAccessPolicy policy = new AdminEndpointAccessPolicy();

    @Test
    void classifiesPublicLocalAndAuthenticatedContractsExplicitly() {
        assertThat(policy.accessMode("GET", "/api/health")).isEqualTo(AccessMode.PUBLIC);
        assertThat(policy.accessMode("GET", "/api/admin/security/status")).isEqualTo(AccessMode.PUBLIC);
        assertThat(policy.accessMode("POST", "/api/admin/security/claim")).isEqualTo(AccessMode.PUBLIC);
        assertThat(policy.accessMode("POST", "/api/admin/security/login")).isEqualTo(AccessMode.PUBLIC);
        assertThat(policy.accessMode("POST", "/api/admin/security/local/reset-password")).isEqualTo(AccessMode.LOCAL_ADMIN);
        assertThat(policy.accessMode("GET", "/api/admin/security/session")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("POST", "/api/admin/security/logout")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("GET", "/api/application-state")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("GET", "/api/network/tailscale/devices")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("GET", "/api/system/support/logs")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("POST", "/api/backups/full/run")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("GET", "/home")).isEqualTo(AccessMode.NOT_API);
    }

    @Test
    void doesNotTreatOtherMethodsOrSecuritySubpathsAsPublic() {
        assertThat(policy.accessMode("POST", "/api/health")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("GET", "/api/admin/security/claim")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("POST", "/api/admin/security/anything-else")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("OPTIONS", "/api/apps")).isEqualTo(AccessMode.AUTHENTICATED);
    }
}

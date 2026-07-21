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
        assertThat(policy.accessMode("GET", "/api/system/version")).isEqualTo(AccessMode.PUBLIC);
        assertThat(policy.accessMode("POST", "/api/admin/security/claim")).isEqualTo(AccessMode.PUBLIC);
        assertThat(policy.accessMode("POST", "/api/admin/security/login")).isEqualTo(AccessMode.PUBLIC);
        assertThat(policy.accessMode("POST", "/api/admin/security/local/reset-password")).isEqualTo(AccessMode.LOCAL_ADMIN);
        assertThat(policy.accessMode("POST", "/api/v1/pro/identity/local/rotate-installation")).isEqualTo(AccessMode.LOCAL_ADMIN);
        assertThat(policy.accessMode("GET", "/api/v1/pro/status")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("GET", "/api/v1/extensions/autark-pro/ui-manifest")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("GET", "/api/v1/extensions/autark-pro/assets/entry.js")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("GET", "/api/v1/extensions/autark-pro/surfaces/pro.dashboard")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("POST", "/api/v1/pro/activation/start")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("POST", "/api/v1/pro/activation/complete")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("POST", "/api/v1/pro/entitlement/refresh")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("POST", "/api/v1/pro/module/check")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("POST", "/api/v1/pro/module/install")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("POST", "/api/v1/pro/module/remove")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("POST", "/api/v1/pro/deactivate")).isEqualTo(AccessMode.AUTHENTICATED);
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
        assertThat(policy.accessMode("POST", "/api/system/version")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("GET", "/api/admin/security/claim")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("POST", "/api/admin/security/anything-else")).isEqualTo(AccessMode.AUTHENTICATED);
        assertThat(policy.accessMode("OPTIONS", "/api/apps")).isEqualTo(AccessMode.AUTHENTICATED);
    }
}

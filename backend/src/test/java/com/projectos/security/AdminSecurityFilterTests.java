package com.projectos.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.ServletException;

class AdminSecurityFilterTests {

    @Test
    void allowsReadOnlyRequestsWithoutToken() throws ServletException, IOException {
        AdminSecurityFilter filter = new AdminSecurityFilter(new FakeSecurityService(false));
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/apps");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void rejectsMutatingApiRequestsWithoutToken() throws ServletException, IOException {
        AdminSecurityFilter filter = new AdminSecurityFilter(new FakeSecurityService(false));
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/discover/apps/vaultwarden/install");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("Autark-OS admin login is required.");
    }

    @Test
    void allowsMutatingApiRequestsWithValidBearerToken() throws ServletException, IOException {
        AdminSecurityFilter filter = new AdminSecurityFilter(new FakeSecurityService(false));
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/backups/full/run");
        request.addHeader("Authorization", "Bearer valid");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void allowsClaimAndLoginEndpointsWithoutToken() throws ServletException, IOException {
        AdminSecurityFilter filter = new AdminSecurityFilter(new FakeSecurityService(false));
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/admin/security/login");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(200);
    }

    private static class FakeSecurityService extends AdminSecurityService {
        private final boolean devMode;

        FakeSecurityService(boolean devMode) {
            super(null, devMode);
            this.devMode = devMode;
        }

        @Override
        public AdminSecurityStatus status() {
            return new AdminSecurityStatus(devMode, true, !devMode, "Login required.", "");
        }

        @Override
        public boolean authenticate(String token) {
            return devMode || "valid".equals(token);
        }
    }
}

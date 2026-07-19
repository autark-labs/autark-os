package com.autarkos.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;

class AdminSecurityFilterTests {

    @Test
    void allowsOnlyMinimalPublicApiWithoutToken() throws Exception {
        AdminSecurityService service = mock(AdminSecurityService.class);
        AdminSecurityFilter filter = filter(service);

        assertAllowed(filter, "GET", "/api/health");
        assertAllowed(filter, "HEAD", "/api/health");
        assertAllowed(filter, "GET", "/api/admin/security/status");
        assertAllowed(filter, "GET", "/api/system/version");
        assertAllowed(filter, "POST", "/api/admin/security/claim");
        assertAllowed(filter, "POST", "/api/admin/security/login");
        assertAllowed(filter, "GET", "/home");
    }

    @Test
    void rejectsSensitiveReadAndMutationWithoutSession() throws Exception {
        AdminSecurityFilter filter = filter(mock(AdminSecurityService.class));

        assertRejected(filter, "GET", "/api/apps", 401, "admin_auth_required");
        assertRejected(filter, "GET", "/api/system/support/bundle", 401, "admin_auth_required");
        assertRejected(filter, "POST", "/api/discover/apps/vaultwarden/install", 401, "admin_auth_required");
        assertRejected(filter, "GET", "/api/admin/security/session", 401, "admin_auth_required");
    }

    @Test
    void contextPathCannotMoveApiRoutesOutsideTheSecurityPolicy() throws Exception {
        AdminSecurityFilter filter = filter(mock(AdminSecurityService.class));
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/autark/api/system/settings");
        request.setContextPath("/autark");

        assertRejected(filter, request, 401, "admin_auth_required");
    }

    @Test
    void acceptsBearerAndHttpOnlyCookieSessions() throws Exception {
        AdminSecurityService service = mock(AdminSecurityService.class);
        when(service.authenticate("valid")).thenReturn(true);
        AdminSecurityFilter filter = filter(service);

        MockHttpServletRequest bearerRequest = new MockHttpServletRequest("GET", "/api/apps");
        bearerRequest.addHeader("Authorization", "Bearer valid");
        assertAllowed(filter, bearerRequest);

        MockHttpServletRequest cookieRequest = new MockHttpServletRequest("GET", "/api/apps");
        cookieRequest.setCookies(new Cookie(AdminSessionTokenResolver.COOKIE_NAME, "valid"));
        assertAllowed(filter, cookieRequest);
    }

    @Test
    void localRecoveryRequiresLoopbackAndLocalSecret() throws Exception {
        AdminSecurityService service = mock(AdminSecurityService.class);
        when(service.authenticateLocalRequest("127.0.0.1", "local-secret")).thenReturn(true);
        AdminSecurityFilter filter = filter(service);

        MockHttpServletRequest allowed = new MockHttpServletRequest("POST", "/api/admin/security/local/reset-password");
        allowed.setRemoteAddr("127.0.0.1");
        allowed.addHeader(AdminSecurityFilter.LOCAL_SECRET_HEADER, "local-secret");
        assertAllowed(filter, allowed);

        MockHttpServletRequest remote = new MockHttpServletRequest("POST", "/api/admin/security/local/reset-password");
        remote.setRemoteAddr("192.168.1.22");
        remote.addHeader(AdminSecurityFilter.LOCAL_SECRET_HEADER, "local-secret");
        assertRejected(filter, remote, 403, "local_admin_required");
    }

    @Test
    void appliesBrowserSecurityHeadersWithoutHstsOnLanHttp() throws Exception {
        AdminSecurityFilter filter = filter(mock(AdminSecurityService.class));
        MockHttpServletResponse response = assertAllowed(filter, "GET", "/api/health");

        assertThat(response.getHeader("Content-Security-Policy")).contains("default-src 'self'", "frame-ancestors 'none'");
        assertThat(response.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.getHeader("X-Frame-Options")).isEqualTo("DENY");
        assertThat(response.getHeader("Referrer-Policy")).isEqualTo("no-referrer");
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(response.getHeader("Strict-Transport-Security")).isNull();
    }

    private AdminSecurityFilter filter(AdminSecurityService service) {
        return new AdminSecurityFilter(service, new AdminEndpointAccessPolicy());
    }

    private MockHttpServletResponse assertAllowed(AdminSecurityFilter filter, String method, String path) throws ServletException, IOException {
        return assertAllowed(filter, new MockHttpServletRequest(method, path));
    }

    private MockHttpServletResponse assertAllowed(AdminSecurityFilter filter, MockHttpServletRequest request) throws ServletException, IOException {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        assertThat(response.getStatus()).isEqualTo(200);
        return response;
    }

    private void assertRejected(AdminSecurityFilter filter, String method, String path, int status, String code) throws Exception {
        assertRejected(filter, new MockHttpServletRequest(method, path), status, code);
    }

    private void assertRejected(AdminSecurityFilter filter, MockHttpServletRequest request, int status, String code) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        assertThat(response.getStatus()).isEqualTo(status);
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains(code);
    }
}

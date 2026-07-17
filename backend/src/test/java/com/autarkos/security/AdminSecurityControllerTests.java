package com.autarkos.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

class AdminSecurityControllerTests {

    @Test
    void browserClaimUsesProtectedCookieAndNeverReturnsTheBearerToken() {
        AdminSecurityService service = mock(AdminSecurityService.class);
        when(service.claim(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(new AdminSecuritySession(true, "browser-secret", "Claimed.", "2026-07-16T13:00:00Z", 0));
        when(service.absoluteLifetimeSeconds()).thenReturn(43_200L);
        AdminSecurityController controller = new AdminSecurityController(service);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/admin/security/claim");
        request.setRemoteAddr("192.168.1.20");

        ResponseEntity<AdminSecuritySession> response = controller.claim(new AdminClaimRequest("local-code", "correct horse battery"), request);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody().token()).isEmpty();
        assertThat(response.getHeaders().getFirst(HttpHeaders.SET_COOKIE))
                .contains("autark-os-admin-session=browser-secret", "HttpOnly", "SameSite=Strict", "Path=/api")
                .doesNotContain("Secure");
    }

    @Test
    void cliLoginReceivesBearerTokenWhileStillPreservingCookieCompatibility() {
        AdminSecurityService service = mock(AdminSecurityService.class);
        when(service.login(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(new AdminSecuritySession(true, "cli-secret", "Logged in.", "2026-07-16T13:00:00Z", 0));
        when(service.absoluteLifetimeSeconds()).thenReturn(43_200L);
        AdminSecurityController controller = new AdminSecurityController(service);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/admin/security/login");
        request.addHeader("X-Autark-OS-Client", "cli");

        ResponseEntity<AdminSecuritySession> response = controller.login(new AdminLoginRequest("correct horse battery"), request);

        assertThat(response.getBody().token()).isEqualTo("cli-secret");
    }

    @Test
    void throttledLoginReturnsRetryAfterWithoutSettingACookie() {
        AdminSecurityService service = mock(AdminSecurityService.class);
        when(service.login(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(AdminSecuritySession.rateLimited("Wait before trying again.", 120));
        AdminSecurityController controller = new AdminSecurityController(service);

        ResponseEntity<AdminSecuritySession> response = controller.login(new AdminLoginRequest("wrong password"), new MockHttpServletRequest());

        assertThat(response.getStatusCode().value()).isEqualTo(429);
        assertThat(response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo("120");
        assertThat(response.getHeaders().getFirst(HttpHeaders.SET_COOKIE)).isNull();
        assertThat(response.getBody().token()).isEmpty();
    }

    @Test
    void trustedLocalHttpsForwardingAddsSecureWithoutTrustingRemoteForwarding() {
        AdminSecurityService service = mock(AdminSecurityService.class);
        when(service.login(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(new AdminSecuritySession(true, "secret", "Logged in.", "2026-07-16T13:00:00Z", 0));
        when(service.absoluteLifetimeSeconds()).thenReturn(43_200L);
        AdminSecurityController controller = new AdminSecurityController(service);
        MockHttpServletRequest localProxy = new MockHttpServletRequest();
        localProxy.setRemoteAddr("127.0.0.1");
        localProxy.addHeader("X-Forwarded-Proto", "https");
        MockHttpServletRequest remote = new MockHttpServletRequest();
        remote.setRemoteAddr("192.168.1.20");
        remote.addHeader("X-Forwarded-Proto", "https");

        assertThat(controller.login(new AdminLoginRequest("correct horse battery"), localProxy).getHeaders().getFirst(HttpHeaders.SET_COOKIE)).contains("Secure");
        assertThat(controller.login(new AdminLoginRequest("correct horse battery"), remote).getHeaders().getFirst(HttpHeaders.SET_COOKIE)).doesNotContain("Secure");
    }

    @Test
    void cookiePathIncludesTheConfiguredApplicationContext() {
        AdminSecurityService service = mock(AdminSecurityService.class);
        when(service.login(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(new AdminSecuritySession(true, "secret", "Logged in.", "2026-07-16T13:00:00Z", 0));
        when(service.absoluteLifetimeSeconds()).thenReturn(43_200L);
        AdminSecurityController controller = new AdminSecurityController(service);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/autark/api/admin/security/login");
        request.setContextPath("/autark");

        assertThat(controller.login(new AdminLoginRequest("correct horse battery"), request).getHeaders().getFirst(HttpHeaders.SET_COOKIE))
                .contains("Path=/autark/api");
    }
}

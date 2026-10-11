package com.autarkos.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import jakarta.servlet.http.Cookie;

class AdminSecurityControllerTests {

    @Test
    void sessionInspectionDoesNotRenewWhileExplicitActivityRenewsWithoutExposingTheToken() {
        AdminSecurityService service = mock(AdminSecurityService.class);
        AdminSecuritySession active = new AdminSecuritySession(true, "secret", "Active.", "2026-07-16T13:00:00Z", 0);
        when(service.session("secret")).thenReturn(active);
        when(service.renewSession("secret")).thenReturn(active);
        AdminSecurityController controller = new AdminSecurityController(service);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/admin/security/session");
        request.setCookies(new Cookie(AdminSessionTokenResolver.COOKIE_NAME, "secret"));

        ResponseEntity<AdminSecuritySession> inspected = controller.session(request);

        assertThat(inspected.getStatusCode().value()).isEqualTo(200);
        assertThat(inspected.getBody().token()).isEmpty();
        assertThat(inspected.getHeaders().getCacheControl()).isEqualTo("no-store");
        verify(service, never()).renewSession("secret");

        request.setMethod("POST");
        ResponseEntity<AdminSecuritySession> renewed = controller.renewSession(request);

        verify(service).renewSession("secret");
        assertThat(renewed.getStatusCode().value()).isEqualTo(200);
        assertThat(renewed.getBody().token()).isEmpty();
        assertThat(renewed.getHeaders().getFirst(HttpHeaders.SET_COOKIE)).isNull();
    }

    @Test
    void activityOnAnExpiredSessionReturnsUnauthorized() {
        AdminSecurityService service = mock(AdminSecurityService.class);
        when(service.renewSession("expired")).thenReturn(AdminSecuritySession.denied("Log in again."));
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/admin/security/session");
        request.addHeader("Authorization", "Bearer expired");

        ResponseEntity<AdminSecuritySession> response = new AdminSecurityController(service).renewSession(request);

        assertThat(response.getStatusCode().value()).isEqualTo(401);
        assertThat(response.getBody().authorized()).isFalse();
        assertThat(response.getHeaders().getFirst(HttpHeaders.SET_COOKIE)).isNull();
    }

    @Test
    void logoutRevokesTheResolvedSessionAndExpiresItsCookieAtTheSameContextPath() {
        AdminSecurityService service = mock(AdminSecurityService.class);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/autark/api/admin/security/logout");
        request.setContextPath("/autark");
        request.setSecure(true);
        request.setCookies(new Cookie(AdminSessionTokenResolver.COOKIE_NAME, "secret"));

        ResponseEntity<AdminSecuritySession> response = new AdminSecurityController(service).logout(request);

        verify(service).logout("secret");
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody().authorized()).isFalse();
        assertThat(response.getBody().token()).isEmpty();
        assertThat(response.getHeaders().getFirst(HttpHeaders.SET_COOKIE))
                .contains("autark-os-admin-session=;", "Max-Age=0", "HttpOnly", "Secure", "SameSite=Strict", "Path=/autark/api");
    }

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

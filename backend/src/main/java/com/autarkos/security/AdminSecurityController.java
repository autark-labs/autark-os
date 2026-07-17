package com.autarkos.security;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.time.Duration;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/admin/security")
public class AdminSecurityController {

    private static final String CLI_CLIENT_HEADER = "X-Autark-OS-Client";

    private final AdminSecurityService service;

    public AdminSecurityController(AdminSecurityService service) {
        this.service = service;
    }

    @GetMapping("/status")
    public ResponseEntity<AdminSecurityStatus> status() {
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(service.status());
    }

    @PostMapping("/claim")
    public ResponseEntity<AdminSecuritySession> claim(@RequestBody AdminClaimRequest request, HttpServletRequest httpRequest) {
        return sessionResponse(service.claim(request, clientId(httpRequest)), httpRequest);
    }

    @PostMapping("/login")
    public ResponseEntity<AdminSecuritySession> login(@RequestBody AdminLoginRequest request, HttpServletRequest httpRequest) {
        return sessionResponse(service.login(request, clientId(httpRequest)), httpRequest);
    }

    @GetMapping("/session")
    public ResponseEntity<AdminSecuritySession> session(HttpServletRequest request) {
        AdminSecuritySession session = service.session(AdminSessionTokenResolver.resolve(request));
        return session.authorized()
                ? ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(session.withoutToken())
                : ResponseEntity.status(HttpStatus.UNAUTHORIZED).header(HttpHeaders.CACHE_CONTROL, "no-store").body(session);
    }

    @PostMapping("/logout")
    public ResponseEntity<AdminSecuritySession> logout(HttpServletRequest request) {
        service.logout(AdminSessionTokenResolver.resolve(request));
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.SET_COOKIE, expiredSessionCookie(request).toString())
                .body(new AdminSecuritySession(false, "", "Logged out.", "", 0));
    }

    @PostMapping("/local/reset-password")
    public ResponseEntity<AdminSecurityActionResult> resetPassword(@RequestBody AdminPasswordResetRequest request, HttpServletRequest httpRequest) {
        try {
            return ResponseEntity.ok()
                    .header(HttpHeaders.CACHE_CONTROL, "no-store")
                    .header(HttpHeaders.SET_COOKIE, expiredSessionCookie(httpRequest).toString())
                    .body(service.resetPassword(request));
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().header(HttpHeaders.CACHE_CONTROL, "no-store").body(new AdminSecurityActionResult(
                    false,
                    "error",
                    "Administrator password was not reset",
                    exception.getMessage(),
                    java.time.Instant.now()));
        }
    }

    private ResponseEntity<AdminSecuritySession> sessionResponse(AdminSecuritySession session, HttpServletRequest request) {
        if (!session.authorized()) {
            ResponseEntity.BodyBuilder response = session.retryAfterSeconds() > 0
                    ? ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header(HttpHeaders.RETRY_AFTER, Long.toString(session.retryAfterSeconds()))
                    : ResponseEntity.status(HttpStatus.UNAUTHORIZED);
            return response.header(HttpHeaders.CACHE_CONTROL, "no-store").body(session.withoutToken());
        }
        AdminSecuritySession responseBody = "cli".equalsIgnoreCase(request.getHeader(CLI_CLIENT_HEADER))
                ? session
                : session.withoutToken();
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.SET_COOKIE, sessionCookie(session.token(), request).toString())
                .body(responseBody);
    }

    private ResponseCookie sessionCookie(String token, HttpServletRequest request) {
        return ResponseCookie.from(AdminSessionTokenResolver.COOKIE_NAME, token)
                .httpOnly(true)
                .secure(secureRequest(request))
                .sameSite("Strict")
                .path(cookiePath(request))
                .maxAge(Duration.ofSeconds(service.absoluteLifetimeSeconds()))
                .build();
    }

    private ResponseCookie expiredSessionCookie(HttpServletRequest request) {
        return ResponseCookie.from(AdminSessionTokenResolver.COOKIE_NAME, "")
                .httpOnly(true)
                .secure(secureRequest(request))
                .sameSite("Strict")
                .path(cookiePath(request))
                .maxAge(Duration.ZERO)
                .build();
    }

    private boolean secureRequest(HttpServletRequest request) {
        if (request.isSecure()) {
            return true;
        }
        return isLoopback(request.getRemoteAddr()) && "https".equalsIgnoreCase(request.getHeader("X-Forwarded-Proto"));
    }

    private String cookiePath(HttpServletRequest request) {
        String contextPath = request.getContextPath();
        return contextPath == null || contextPath.isBlank() ? "/api" : contextPath + "/api";
    }

    private String clientId(HttpServletRequest request) {
        if (isLoopback(request.getRemoteAddr())) {
            String forwardedFor = request.getHeader("X-Forwarded-For");
            if (forwardedFor != null && !forwardedFor.isBlank()) {
                return forwardedFor.split(",", 2)[0].trim();
            }
        }
        return request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
    }

    private boolean isLoopback(String value) {
        if (value == null || value.isBlank()) {
            return false;
        }
        try {
            return InetAddress.getByName(value).isLoopbackAddress();
        } catch (UnknownHostException exception) {
            return false;
        }
    }
}

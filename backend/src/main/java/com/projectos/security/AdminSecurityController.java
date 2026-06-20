package com.projectos.security;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/security")
public class AdminSecurityController {

    private final AdminSecurityService service;

    public AdminSecurityController(AdminSecurityService service) {
        this.service = service;
    }

    @GetMapping("/status")
    public AdminSecurityStatus status() {
        return service.status();
    }

    @PostMapping("/claim")
    public ResponseEntity<AdminSecuritySession> claim(@RequestBody AdminClaimRequest request) {
        AdminSecuritySession session = service.claim(request);
        return session.authorized() ? ResponseEntity.ok(session) : ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(session);
    }

    @PostMapping("/login")
    public ResponseEntity<AdminSecuritySession> login(@RequestBody AdminLoginRequest request) {
        AdminSecuritySession session = service.login(request);
        return session.authorized() ? ResponseEntity.ok(session) : ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(session);
    }

    @PostMapping("/logout")
    public AdminSecuritySession logout(@RequestHeader(value = "Authorization", required = false) String authorization) {
        service.logout(bearerToken(authorization));
        return new AdminSecuritySession(false, "", "Logged out.");
    }

    private String bearerToken(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            return "";
        }
        return authorization.substring("Bearer ".length()).trim();
    }
}

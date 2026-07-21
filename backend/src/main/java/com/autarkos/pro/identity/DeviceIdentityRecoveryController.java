package com.autarkos.pro.identity;

import java.time.Instant;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/pro/identity/local")
public class DeviceIdentityRecoveryController {

    private final DeviceIdentityService identityService;

    public DeviceIdentityRecoveryController(DeviceIdentityService identityService) {
        this.identityService = identityService;
    }

    @PostMapping("/rotate-installation")
    public ResponseEntity<InstallationIdentityRotationResponse> rotateInstallation(
            @RequestBody InstallationIdentityRotationRequest request) {
        try {
            DeviceIdentity identity = identityService.rotateInstallationIdentity(
                    request == null ? null : request.confirmation());
            return ResponseEntity.ok()
                    .header(HttpHeaders.CACHE_CONTROL, "no-store")
                    .body(new InstallationIdentityRotationResponse(
                            true,
                            identity.deviceId(),
                            identity.installationId(),
                            identity.publicKeyFingerprint(),
                            "Installation identity rotated. The device signing key was preserved.",
                            Instant.now()));
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest()
                    .header(HttpHeaders.CACHE_CONTROL, "no-store")
                    .body(new InstallationIdentityRotationResponse(
                            false,
                            "",
                            "",
                            "",
                            exception.getMessage(),
                            Instant.now()));
        }
    }

    public record InstallationIdentityRotationRequest(String confirmation) {
    }

    public record InstallationIdentityRotationResponse(
            boolean ok,
            String deviceId,
            String installationId,
            String publicKeyFingerprint,
            String message,
            Instant completedAt) {
    }
}

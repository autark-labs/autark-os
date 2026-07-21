package com.autarkos.pro.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class DeviceIdentityRecoveryControllerTests {

    private final DeviceIdentityService service = org.mockito.Mockito.mock(DeviceIdentityService.class);
    private final DeviceIdentityRecoveryController controller = new DeviceIdentityRecoveryController(service);

    @Test
    void rotationReturnsOnlyPublicMetadata() {
        DeviceIdentity identity = identity();
        when(service.rotateInstallationIdentity("ROTATE-INSTALLATION-IDENTITY")).thenReturn(identity);

        var response = controller.rotateInstallation(
                new DeviceIdentityRecoveryController.InstallationIdentityRotationRequest(
                        "ROTATE-INSTALLATION-IDENTITY"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().ok()).isTrue();
        assertThat(response.getBody().deviceId()).isEqualTo(identity.deviceId());
        assertThat(response.getBody().installationId()).isEqualTo(identity.installationId());
        verify(service).rotateInstallationIdentity("ROTATE-INSTALLATION-IDENTITY");
    }

    @Test
    void wrongConfirmationReturnsSafeBadRequest() {
        when(service.rotateInstallationIdentity("WRONG"))
                .thenThrow(new IllegalArgumentException("Exact confirmation required."));

        var response = controller.rotateInstallation(
                new DeviceIdentityRecoveryController.InstallationIdentityRotationRequest("WRONG"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().ok()).isFalse();
        assertThat(response.getBody().deviceId()).isEmpty();
    }

    private DeviceIdentity identity() {
        return new DeviceIdentity(
                "1",
                "11111111-1111-4111-8111-111111111111",
                "22222222-2222-4222-8222-222222222222",
                "Ed25519",
                "device-aaaaaaaaaaaaaaaaaaaaaaaa",
                new DevicePublicKey("OKP", "Ed25519", "public-x"),
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                Instant.parse("2026-07-19T12:00:00Z"),
                Instant.parse("2026-07-19T12:01:00Z"));
    }
}

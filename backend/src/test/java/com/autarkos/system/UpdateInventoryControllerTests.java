package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.autarkos.system.UpdateInventoryModels.Snapshot;
import com.autarkos.system.UpdateInventoryModels.Verification;
import com.fasterxml.jackson.databind.ObjectMapper;

class UpdateInventoryControllerTests {

    @Test
    void acceptsTheInventoryShapeEmittedBeforeTheContinuityBaseline() throws Exception {
        String json = """
                {
                  "schemaVersion": 1,
                  "capturedAt": "2026-09-18T12:00:00Z",
                  "ownerInstanceId": "pos_current",
                  "runtimeRoot": "/var/lib/autark-os",
                  "runtimeRootHash": "sha256:runtime",
                  "managedApps": [{
                    "catalogAppId": "vaultwarden",
                    "appInstanceId": "appinst_vault",
                    "ownerInstanceId": "pos_current",
                    "runtimePath": "/var/lib/autark-os/apps/vaultwarden",
                    "composeProject": "autarkos_current_vaultwarden",
                    "ownershipState": "owned",
                    "relationship": "managed"
                  }]
                }
                """;

        Snapshot snapshot = new ObjectMapper().findAndRegisterModules().readValue(json, Snapshot.class);

        assertThat(snapshot.schemaVersion()).isEqualTo(1);
        assertThat(snapshot.identityFileSha256()).isNull();
        assertThat(snapshot.managedApps()).singleElement().satisfies(app -> {
            assertThat(app.catalogAppId()).isEqualTo("vaultwarden");
            assertThat(app.registrationInstalledAt()).isNull();
        });
    }

    @Test
    void exposesCaptureAndVerificationWithoutReclassifyingInventory() {
        UpdateInventoryService service = mock(UpdateInventoryService.class);
        Snapshot snapshot = new Snapshot(2, Instant.now(), "pos_current",
                "/var/lib/autark-os", "sha256:runtime", "sha256:identity", List.of());
        Verification verification = new Verification(2, Instant.now(), true, "Verified.", snapshot, snapshot, List.of());
        when(service.capture()).thenReturn(snapshot);
        when(service.verify(snapshot)).thenReturn(verification);
        UpdateInventoryController controller = new UpdateInventoryController(service);

        assertThat(controller.capture()).isSameAs(snapshot);
        assertThat(controller.verify(snapshot)).isSameAs(verification);

        verify(service).capture();
        verify(service).verify(snapshot);
    }
}

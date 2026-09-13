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

class UpdateInventoryControllerTests {

    @Test
    void exposesCaptureAndVerificationWithoutReclassifyingInventory() {
        UpdateInventoryService service = mock(UpdateInventoryService.class);
        Snapshot snapshot = new Snapshot(1, Instant.now(), "pos_current", "/var/lib/autark-os", "sha256:runtime", List.of());
        Verification verification = new Verification(1, Instant.now(), true, "Verified.", snapshot, snapshot, List.of(), List.of());
        when(service.capture()).thenReturn(snapshot);
        when(service.verify(snapshot)).thenReturn(verification);
        UpdateInventoryController controller = new UpdateInventoryController(service);

        assertThat(controller.capture()).isSameAs(snapshot);
        assertThat(controller.verify(snapshot)).isSameAs(verification);

        verify(service).capture();
        verify(service).verify(snapshot);
    }
}

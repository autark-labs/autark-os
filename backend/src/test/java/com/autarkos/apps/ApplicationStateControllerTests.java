package com.autarkos.apps;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

class ApplicationStateControllerTests {

    @Test
    void returnsTheCachedSnapshotWhenRefreshIsNotRequested() {
        ApplicationStateService service = mock(ApplicationStateService.class);
        ApplicationState expected = state("idle", false);
        when(service.snapshot()).thenReturn(expected);
        ApplicationStateController controller = new ApplicationStateController(service);

        assertThat(controller.state(false)).isSameAs(expected);

        verify(service).snapshot();
        verifyNoMoreInteractions(service);
    }

    @Test
    void refreshQueryParameterBuildsAndReturnsACurrentSnapshot() {
        ApplicationStateService service = mock(ApplicationStateService.class);
        ApplicationState expected = state("idle", false);
        when(service.refreshNow()).thenReturn(expected);
        ApplicationStateController controller = new ApplicationStateController(service);

        assertThat(controller.state(true)).isSameAs(expected);

        verify(service).refreshNow();
        verifyNoMoreInteractions(service);
    }

    private ApplicationState state(String refreshStatus, boolean stale) {
        Instant now = Instant.parse("2026-06-21T12:00:00Z");
        return new ApplicationState(
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                now,
                refreshStatus,
                now,
                now,
                stale,
                "",
                now.plusSeconds(10));
    }
}

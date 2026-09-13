package com.autarkos.host;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.DeleteMapping;

import com.autarkos.apps.ApplicationStateService;

class ObservedServiceControllerTests {

    @Test
    void listDoesNotRefreshObservedServices() {
        InMemoryObservedServiceService service = new InMemoryObservedServiceService();
        service.current = observed("obs_service", "observed", null, null);
        ObservedServiceController controller = new ObservedServiceController(service);

        controller.list();

        assertThat(service.refreshCalls).isZero();
    }

    @Test
    void controllerDoesNotExposeHardDeleteEndpoint() {
        assertThat(ObservedServiceController.class.getDeclaredMethods())
                .noneSatisfy(method -> assertThat(method.getAnnotation(DeleteMapping.class)).isNotNull());
    }

    @Test
    void controllerDoesNotExposeRetiredPinOrManualMatchActions() {
        assertThat(ObservedServiceController.class.getDeclaredMethods())
                .extracting(java.lang.reflect.Method::getName)
                .doesNotContain("pin", "unpin", "match");
    }

    @Test
    void explicitRefreshScansHostAndSchedulesCachedApplicationStateRefresh() {
        InMemoryObservedServiceService service = new InMemoryObservedServiceService();
        service.current = observed("obs_service", "observed", null, null);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        ObservedServiceController controller = new ObservedServiceController(service, applicationStateService);

        controller.refresh();

        assertThat(service.refreshCalls).isEqualTo(1);
        verify(applicationStateService).refreshInBackground();
        verify(applicationStateService, never()).refreshNow();
    }

    private static ObservedService observed(String id, String visibility, Instant pinnedAt, String catalogAppId) {
        return new ObservedService(
                id,
                "manual_url",
                "http://service.local",
                "Service",
                "http://service.local",
                "External",
                "LAN",
                catalogAppId,
                catalogAppId == null ? "unknown" : "user",
                "external",
                visibility,
                "unknown",
                false,
                "",
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse("2026-06-21T12:00:00Z"),
                pinnedAt,
                null,
                "{}");
    }

    private static final class InMemoryObservedServiceService extends ObservedServiceService {
        private ObservedService current;
        private int refreshCalls;

        private InMemoryObservedServiceService() {
            super(null, null);
        }

        @Override
        public List<ObservedServiceView> list(boolean includeIgnored) {
            return List.of(view(current));
        }

        @Override
        public List<ObservedServiceView> refresh() {
            refreshCalls++;
            return list(true);
        }

        @Override
        public ObservedServiceView get(String id) {
            return view(current);
        }

        private ObservedServiceView view(ObservedService service) {
            return ObservedServiceService.toView(service);
        }
    }
}

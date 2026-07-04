package com.autarkos.host;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.DeleteMapping;

import com.autarkos.apps.ApplicationState;
import com.autarkos.apps.ApplicationStateService;

class ObservedServiceControllerTests {

    @Test
    void unpinKeepsServiceListed() {
        InMemoryObservedServiceService service = new InMemoryObservedServiceService();
        service.current = observed("obs_vaultwarden", "pinned", Instant.parse("2026-06-21T12:00:00Z"), "vaultwarden");
        ObservedServiceController controller = new ObservedServiceController(service);

        HostModels.ActionResult result = controller.unpin("obs_vaultwarden");

        assertThat(result.ok()).isTrue();
        assertThat(controller.list()).extracting(ObservedServiceView::id).containsExactly("obs_vaultwarden");
        assertThat(controller.list().getFirst().pinned()).isFalse();
    }

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
    void matchUpdatesCatalogAppId() {
        InMemoryObservedServiceService service = new InMemoryObservedServiceService();
        service.current = observed("obs_service", "observed", null, null);
        ObservedServiceController controller = new ObservedServiceController(service);

        HostModels.ActionResult result = controller.match("obs_service", new HostModels.ObservedServiceMatchRequest("vaultwarden"));

        assertThat(result.ok()).isTrue();
        assertThat(controller.get("obs_service").catalogAppId()).isEqualTo("vaultwarden");
    }

    @Test
    void pinSchedulesCachedApplicationStateRefreshWithoutBlocking() {
        InMemoryObservedServiceService service = new InMemoryObservedServiceService();
        service.current = observed("obs_service", "observed", null, null);
        ApplicationStateService applicationStateService = mock(ApplicationStateService.class);
        when(applicationStateService.refreshNow()).thenReturn(applicationState());
        ObservedServiceController controller = new ObservedServiceController(service, applicationStateService);

        HostModels.ActionResult result = controller.pin("obs_service");

        assertThat(result.applicationState()).isNotNull();
        verify(applicationStateService).refreshNow();
        verify(applicationStateService, never()).refreshInBackground();
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

    private static ApplicationState applicationState() {
        return new ApplicationState(
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                Instant.parse("2026-06-21T12:00:00Z"));
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

        @Override
        public HostModels.ActionResult pin(String id) {
            current = new ObservedService(
                    current.id(),
                    current.source(),
                    current.fingerprint(),
                    current.displayName(),
                    current.url(),
                    current.category(),
                    current.accessScope(),
                    current.catalogAppId(),
                    current.catalogMatchConfidence(),
                    current.ownershipState(),
                    "pinned",
                    current.runtimeState(),
                    current.healthCheckEnabled(),
                    current.autarkOsInstanceId(),
                    current.firstSeenAt(),
                    current.lastSeenAt(),
                    Instant.parse("2026-06-21T12:00:00Z"),
                    current.ignoredAt(),
                    current.metadataJson());
            return new HostModels.ActionResult(true, "success", "Service pinned", "The service now appears in My Apps.", id, "refresh_observed_services");
        }

        @Override
        public HostModels.ActionResult unpin(String id) {
            current = new ObservedService(
                    current.id(),
                    current.source(),
                    current.fingerprint(),
                    current.displayName(),
                    current.url(),
                    current.category(),
                    current.accessScope(),
                    current.catalogAppId(),
                    current.catalogMatchConfidence(),
                    current.ownershipState(),
                    "observed",
                    current.runtimeState(),
                    current.healthCheckEnabled(),
                    current.autarkOsInstanceId(),
                    current.firstSeenAt(),
                    current.lastSeenAt(),
                    null,
                    current.ignoredAt(),
                    current.metadataJson());
            return new HostModels.ActionResult(true, "success", "Service unpinned", "The service was removed from My Apps but remains observed.", id, "refresh_observed_services");
        }

        @Override
        public HostModels.ActionResult updateCatalogMatch(String id, String catalogAppId) {
            current = new ObservedService(
                    current.id(),
                    current.source(),
                    current.fingerprint(),
                    current.displayName(),
                    current.url(),
                    current.category(),
                    current.accessScope(),
                    catalogAppId,
                    "user",
                    current.ownershipState(),
                    current.userVisibility(),
                    current.runtimeState(),
                    current.healthCheckEnabled(),
                    current.autarkOsInstanceId(),
                    current.firstSeenAt(),
                    current.lastSeenAt(),
                    current.pinnedAt(),
                    current.ignoredAt(),
                    current.metadataJson());
            return new HostModels.ActionResult(true, "success", "App match saved", "The service now affects Marketplace state for " + catalogAppId + ".", id, "refresh_observed_services");
        }

        private ObservedServiceView view(ObservedService service) {
            return ObservedServiceService.toView(service);
        }
    }
}

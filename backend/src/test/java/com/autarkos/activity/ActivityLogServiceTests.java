package com.autarkos.activity;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

class ActivityLogServiceTests {

    @Test
    void onlyMeaningfulSuccessfulMutationsRequestExtensionRefresh() {
        ActivityLogRepository repository =
                mock(ActivityLogRepository.class);
        ApplicationEventPublisher events =
                mock(ApplicationEventPublisher.class);
        ActivityLogService service =
                new ActivityLogService(repository, events);

        service.success(
                "applications",
                "app_started",
                "Started",
                "Started.",
                "example");
        service.info(
                "settings",
                "project_settings_updated",
                "Updated",
                "Updated.");
        service.info(
                "backup",
                "scheduled_backup_not_applicable",
                "Not needed",
                "No work.");
        service.api("GET", "/api/apps", 200, 4);

        verify(events, times(2)).publishEvent(
                any(SuccessfulMutationEvent.class));
    }

    @Test
    void failedActivityNeverRequestsRefresh() {
        ActivityLogRepository repository =
                mock(ActivityLogRepository.class);
        ApplicationEventPublisher events =
                mock(ApplicationEventPublisher.class);
        ActivityLogService service =
                new ActivityLogService(repository, events);

        service.error(
                "applications",
                "app_update",
                "Failed",
                "Failed.",
                "example",
                null);

        verify(events, never()).publishEvent(any());
    }
}

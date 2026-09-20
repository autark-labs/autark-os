package com.autarkos.activity;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

class ActivityLogServiceTests {

    @Test
    void savingNotificationDoesNotPublishAnotherMutation() {
        var repository = mock(ActivityLogRepository.class);
        var events = mock(ApplicationEventPublisher.class);
        when(repository.save(any(ActivityLogEntity.class))).thenAnswer(call -> call.getArgument(0));
        new ActivityLogService(repository, events).notification(
                new ActivityController.NotificationRequest("receipt-1", "success", "Saved", "Settings saved"));
        verify(repository).save(any(ActivityLogEntity.class));
        verify(events, never()).publishEvent(any());
    }

    @Test
    void notificationRequestRejectsInvalidOrOversizedContent() {
        try (var factory = jakarta.validation.Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            org.assertj.core.api.Assertions.assertThat(validator.validate(
                    new ActivityController.NotificationRequest("receipt-1", "info", "Saved", null))).isEmpty();
            org.assertj.core.api.Assertions.assertThat(validator.validate(
                    new ActivityController.NotificationRequest("../invalid", "other", " ", "x".repeat(2001)))).hasSize(4);
        }
    }

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

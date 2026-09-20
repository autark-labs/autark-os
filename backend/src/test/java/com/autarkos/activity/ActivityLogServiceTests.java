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
    void notificationEndpointRoundTripsActionsAndRejectsExternalDestinations() throws Exception {
        var repository = mock(ActivityLogRepository.class);
        when(repository.save(any(ActivityLogEntity.class))).thenAnswer(call -> call.getArgument(0));
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(
                new ActivityController(new ActivityLogService(repository))).build();
        String request = """
                {"id":"receipt-pro","severity":"info","title":"Review Pro",
                 "nextAction":{"id":"review-pro","label":"Review Autark Pro","route":"/pro",
                               "confirmationRequired":false,"danger":false,"disabled":false}}
                """;
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/activity/notifications")
                .contentType("application/json").content(request))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.nextAction.route").value("/pro"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/activity/notifications")
                .contentType("application/json").content(request.replace("\"/pro\"", "\"//outside.example\"")))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isBadRequest());
    }

    @Test
    void savingNotificationDoesNotPublishAnotherMutation() {
        var repository = mock(ActivityLogRepository.class);
        var events = mock(ApplicationEventPublisher.class);
        when(repository.save(any(ActivityLogEntity.class))).thenAnswer(call -> call.getArgument(0));
        new ActivityLogService(repository, events).notification(
                new ActivityController.NotificationRequest("receipt-1", "success", "Saved", "Settings saved", null));
        verify(repository).save(any(ActivityLogEntity.class));
        verify(events, never()).publishEvent(any());
    }

    @Test
    void notificationRequestRejectsInvalidOrOversizedContent() {
        try (var factory = jakarta.validation.Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            org.assertj.core.api.Assertions.assertThat(validator.validate(
                    new ActivityController.NotificationRequest("receipt-1", "info", "Saved", null, null))).isEmpty();
            org.assertj.core.api.Assertions.assertThat(validator.validate(
                    new ActivityController.NotificationRequest("../invalid", "other", " ", "x".repeat(2001), null))).hasSize(4);
            for (var action : java.util.List.of(
                    com.autarkos.api.AutarkOsAction.route("pro", "Review Pro", "//outside.example"),
                    com.autarkos.api.AutarkOsAction.get("external", "Open", "https://outside.example"))) {
                org.assertj.core.api.Assertions.assertThat(validator.validate(
                        new ActivityController.NotificationRequest("receipt-1", "info", "Saved", null, action))).hasSize(1);
            }
            org.assertj.core.api.Assertions.assertThat(validator.validate(
                    new ActivityController.NotificationRequest("receipt-1", "info", "Saved", null,
                            com.autarkos.api.AutarkOsAction.route("pro", "Review Pro", "/pro")))).isEmpty();
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

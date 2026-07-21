package com.autarkos.activity;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.context.ApplicationEventPublisher;

class ApiActivityInterceptorTests {

    @Test
    void ignoresSuccessfulGetPolling() {
        ActivityLogService activity = mock(ActivityLogService.class);
        ApplicationEventPublisher events =
                mock(ApplicationEventPublisher.class);
        ApiActivityInterceptor interceptor =
                new ApiActivityInterceptor(activity, events);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/system/setup-status");
        MockHttpServletResponse response = new MockHttpServletResponse();
        response.setStatus(200);

        interceptor.preHandle(request, response, new Object());
        interceptor.afterCompletion(request, response, new Object(), null);

        verifyNoInteractions(activity);
        verifyNoInteractions(events);
    }

    @Test
    void retainsMutationsAndFailuresForUserVisibleHistory() {
        ActivityLogService activity = mock(ActivityLogService.class);
        ApplicationEventPublisher events =
                mock(ApplicationEventPublisher.class);
        ApiActivityInterceptor interceptor =
                new ApiActivityInterceptor(activity, events);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/apps/vaultwarden/start");
        MockHttpServletResponse response = new MockHttpServletResponse();
        response.setStatus(202);

        interceptor.preHandle(request, response, new Object());
        interceptor.afterCompletion(request, response, new Object(), null);

        verify(activity).api(
                eq("POST"),
                eq("/api/apps/vaultwarden/start"),
                eq(202),
                anyLong(),
                anyString());
        ArgumentCaptor<ApiMutationCompletedEvent> published =
                ArgumentCaptor.forClass(
                        ApiMutationCompletedEvent.class);
        verify(events).publishEvent(published.capture());
        org.assertj.core.api.Assertions
                .assertThat(published.getValue())
                .satisfies(event -> {
                    org.assertj.core.api.Assertions
                            .assertThat(event.method())
                            .isEqualTo("POST");
                    org.assertj.core.api.Assertions
                            .assertThat(event.path())
                            .isEqualTo(
                                    "/api/apps/vaultwarden/start");
                    org.assertj.core.api.Assertions
                            .assertThat(event.correlationId())
                            .isNotBlank();
                });
    }
}

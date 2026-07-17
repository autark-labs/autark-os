package com.autarkos.activity;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class ApiActivityInterceptorTests {

    @Test
    void ignoresSuccessfulGetPolling() {
        ActivityLogService activity = mock(ActivityLogService.class);
        ApiActivityInterceptor interceptor = new ApiActivityInterceptor(activity);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/system/setup-status");
        MockHttpServletResponse response = new MockHttpServletResponse();
        response.setStatus(200);

        interceptor.preHandle(request, response, new Object());
        interceptor.afterCompletion(request, response, new Object(), null);

        verifyNoInteractions(activity);
    }

    @Test
    void retainsMutationsAndFailuresForUserVisibleHistory() {
        ActivityLogService activity = mock(ActivityLogService.class);
        ApiActivityInterceptor interceptor = new ApiActivityInterceptor(activity);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/apps/vaultwarden/start");
        MockHttpServletResponse response = new MockHttpServletResponse();
        response.setStatus(202);

        interceptor.preHandle(request, response, new Object());
        interceptor.afterCompletion(request, response, new Object(), null);

        verify(activity).api(eq("POST"), eq("/api/apps/vaultwarden/start"), eq(202), anyLong());
    }
}

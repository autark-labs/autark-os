package com.autarkos.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class SpaNavigationFallbackFilterTests {

    private final SpaNavigationFallbackFilter filter = new SpaNavigationFallbackFilter();

    @Test
    void forwardsHtmlNavigationForActiveAndUnknownClientRoutes() throws Exception {
        assertForwarded("/pro");
        assertForwarded("/apps/found");
        assertForwarded("/a-stale-bookmark");
    }

    @Test
    void leavesApisHealthAssetsAndDownloadsToTheirNormalHandlers() throws Exception {
        assertPassedThrough("/api/apps");
        assertPassedThrough("/api/unknown-endpoint");
        assertPassedThrough("/actuator/health");
        assertPassedThrough("/error");
        assertPassedThrough("/assets/index-abc123.js");
        assertPassedThrough("/downloads/autark-os.run");
        assertPassedThrough("/favicon.ico");
    }

    @Test
    void doesNotTreatDataFetchesAsBrowserNavigations() throws Exception {
        MockHttpServletRequest request = requestFor("/unrecognized-api-like-request");
        request.setMethod("POST");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean passedThrough = new AtomicBoolean(false);

        filter.doFilter(request, response, (ignoredRequest, ignoredResponse) -> passedThrough.set(true));

        assertThat(passedThrough).isTrue();
        assertThat(response.getForwardedUrl()).isNull();
    }

    private void assertForwarded(String path) throws Exception {
        MockHttpServletRequest request = requestFor(path);
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean passedThrough = new AtomicBoolean(false);

        filter.doFilter(request, response, (ignoredRequest, ignoredResponse) -> passedThrough.set(true));

        assertThat(response.getForwardedUrl()).isEqualTo("/index.html");
        assertThat(passedThrough).isFalse();
    }

    private void assertPassedThrough(String path) throws Exception {
        MockHttpServletRequest request = requestFor(path);
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean passedThrough = new AtomicBoolean(false);

        filter.doFilter(request, response, (ignoredRequest, ignoredResponse) -> passedThrough.set(true));

        assertThat(response.getForwardedUrl()).isNull();
        assertThat(passedThrough).isTrue();
    }

    private MockHttpServletRequest requestFor(String path) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        request.addHeader(HttpHeaders.ACCEPT, MediaType.TEXT_HTML_VALUE);
        return request;
    }
}

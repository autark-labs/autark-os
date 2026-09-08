package com.autarkos.extensions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import com.autarkos.security.AdminSecurityService;
import com.autarkos.security.AdminSecurityFilter;
import com.autarkos.security.AdminEndpointAccessPolicy;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;

class ExtensionActionsTests {
    private static final String BODY = """
            {"schemaVersion":"1","surface":"pro.dashboard","actionId":"private.intent","payload":{"opaque":"intent"}}
            """;

    @Test
    void actionsRequireAnAdministratorAndTheSameOriginHeader() throws Exception {
        var service = mock(ExtensionHostService.class);
        var scheduler = mock(ExtensionRefreshScheduler.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<ExtensionRefreshScheduler> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(scheduler);
        var security = mock(AdminSecurityService.class);
        when(security.authenticate("valid")).thenReturn(true);
        var summary = new ExtensionActionResult.Summary(Instant.now(), 0, "none");
        when(service.action(eq("autark-pro"), any())).thenReturn(new ExtensionActionResult(
                "1", "completed", JsonNodeFactory.instance.objectNode(), summary));
        var mvc = MockMvcBuilders.standaloneSetup(new ExtensionHostController(service, provider))
                .addFilters(new AdminSecurityFilter(security, new AdminEndpointAccessPolicy())).build();
        String path = "/api/v1/extensions/autark-pro/actions";
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(BODY)
                .header("X-Autark-Extension-Action", "1")).andExpect(status().isUnauthorized());
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(BODY)
                .header("Authorization", "Bearer valid")).andExpect(status().isForbidden());
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(BODY)
                .header("Authorization", "Bearer valid").header("X-Autark-Extension-Action", "1")
                .header("Sec-Fetch-Site", "cross-site")).andExpect(status().isForbidden());
        verifyNoInteractions(service);
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(BODY)
                .header("Authorization", "Bearer valid").header("X-Autark-Extension-Action", "1"))
                .andExpect(status().isOk());
        verify(scheduler).acceptSummary(summary);
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content("x".repeat(16385))
                .header("Authorization", "Bearer valid").header("X-Autark-Extension-Action", "1"))
                .andExpect(status().isPayloadTooLarge());
        verify(service, times(1)).action(any(), any());
    }

    @Test
    void rejectsMalformedUnknownDuplicateAndTrailingInputs() {
        assertThat(ExtensionActionRequest.decode(BODY.getBytes(StandardCharsets.UTF_8)).payload().get("opaque").asText())
                .isEqualTo("intent");
        for (String input : new String[]{"null", "[]", BODY + "{}", BODY.replace("\"1\"", "\"2\""),
                BODY.replace("\"payload\":", "\"extra\":true,\"payload\":"),
                BODY.replace("\"payload\":", "\"surface\":\"other\",\"payload\":")}) {
            assertThatThrownBy(() -> ExtensionActionRequest.decode(input.getBytes(StandardCharsets.UTF_8)))
                    .isInstanceOf(ResponseStatusException.class);
        }
    }
}

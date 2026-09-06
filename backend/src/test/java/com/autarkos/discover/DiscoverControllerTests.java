package com.autarkos.discover;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import com.autarkos.activity.ActivityLogService;
import com.autarkos.marketplace.api.MarketplaceExceptionHandler;
import com.autarkos.system.BetaScope;

class DiscoverControllerTests {
    @Test
    void excludedAppCannotStartSetupPreviewOrInstallationThroughDirectApi() throws Exception {
        var service = mock(DiscoverService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new DiscoverController(service))
                .setControllerAdvice(new MarketplaceExceptionHandler(mock(ActivityLogService.class))).build();
        for (String app : List.of("immich", "obsidian-livesync", "vaultwarden", "unknown")) {
            mvc.perform(get("/api/discover/apps/" + app)).andExpect(status().isNotFound());
            for (var request : List.of(get("/api/discover/apps/" + app + "/setup-schema"),
                    post("/api/discover/apps/" + app + "/install-preview"),
                    post("/api/discover/apps/" + app + "/install"))) {
                mvc.perform(request).andExpect(status().isConflict())
                        .andExpect(jsonPath("$.code").value("beta_scope_deferred"))
                        .andExpect(jsonPath("$.message").value(BetaScope.INSTALL_UNAVAILABLE));
            }
        }
        verifyNoInteractions(service);
    }

    @Test
    void discoveryFiltersOnlyTheNewInstallSurfaceAndEligibleInstallStillDelegates() {
        var service = mock(DiscoverService.class);
        var included = mock(DiscoverAppView.class);
        var excluded = mock(DiscoverAppView.class);
        when(included.id()).thenReturn("freshrss");
        when(excluded.id()).thenReturn("vaultwarden");
        when(service.apps()).thenReturn(List.of(included, excluded));
        var controller = new DiscoverController(service);
        assertThat(controller.apps()).containsExactly(included);
        for (var app : BetaScope.CURRENT.apps()) {
            controller.install(app.id(), null);
            verify(service).install(app.id(), null);
        }
        assertThat(BetaScope.CURRENT.qualificationStatus()).isEqualTo("pending");
    }
}

package com.autarkos.pro.entitlement;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import com.autarkos.activity.ActivityLogService;
import com.autarkos.marketplace.api.MarketplaceExceptionHandler;
import com.autarkos.pro.module.ProModuleManager;

class ProBetaScopeTests {
    @Test
    void newProWorkIsRejectedButExistingStatusAndRemovalRemainAccessible() throws Exception {
        var service = mock(ProEntitlementService.class);
        var manager = mock(ProModuleManager.class);
        var mvc = MockMvcBuilders.standaloneSetup(new ProEntitlementController(service, manager))
                .setControllerAdvice(new MarketplaceExceptionHandler(mock(ActivityLogService.class))).build();
        for (String path : new String[]{"activation/start", "activation/complete", "module/check", "module/install"}) {
            mvc.perform(post("/api/v1/pro/" + path).contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("beta_scope_deferred"));
        }
        verifyNoInteractions(service, manager);
        mvc.perform(get("/api/v1/pro/status")).andExpect(status().isOk());
        mvc.perform(post("/api/v1/pro/module/remove").contentType(MediaType.APPLICATION_JSON)
                .content("{\"confirmation\":\"REMOVE-AUTARK-PRO\"}")).andExpect(status().isOk());
        verify(service).status();
        verify(manager).remove();
    }
}

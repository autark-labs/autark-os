package com.autarkos.extensions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

class ExtensionHostControllerTests {

    @Test
    void explicitRefreshQueuesReadOnlyWorkInsteadOfRunningInline() {
        ExtensionHostService service =
                mock(ExtensionHostService.class);
        ExtensionRefreshScheduler scheduler =
                mock(ExtensionRefreshScheduler.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<ExtensionRefreshScheduler> provider =
                mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(scheduler);
        ExtensionHostController controller =
                new ExtensionHostController(service, provider);

        var response = controller.refresh("autark-pro");

        assertThat(response.getStatusCode().value()).isEqualTo(202);
        verify(service).requireRefreshAvailable("autark-pro");
        verify(scheduler).requestRefresh("explicit_refresh");
        verify(service, never()).refresh("autark-pro");
    }
}

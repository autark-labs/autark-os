package com.autarkos.pro.entitlement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.jobs.AutarkOsJobStep;
import com.autarkos.pro.model.ProEntitlementStatus;
import com.autarkos.pro.module.ProModuleManager;
import com.autarkos.pro.module.ProModuleManager.ProModuleAuthorization;

class ProEntitlementControllerTests {

    @Test
    void moduleActionsUseVerifiedBackendAuthorityAndReturnSharedJobs() {
        ProEntitlementService service =
                mock(ProEntitlementService.class);
        ProModuleManager manager = mock(ProModuleManager.class);
        ProModuleAuthorization authorization =
                new ProModuleAuthorization(
                        mock(ProEntitlementStatus.class),
                        "staging");
        AutarkOsJob job = job();
        when(service.moduleAuthorization()).thenReturn(authorization);
        when(manager.checkForRelease(authorization)).thenReturn(job);
        when(manager.installOrUpdate(authorization)).thenReturn(job);
        when(manager.remove()).thenReturn(job);
        ProEntitlementController controller =
                new ProEntitlementController(service, manager);

        assertThat(controller.checkModuleRelease()).isSameAs(job);
        assertThat(controller.installOrUpdateModule()).isSameAs(job);
        assertThat(controller.removeModule(
                new ProEntitlementController.ModuleRemovalRequest(
                        ProEntitlementController.MODULE_REMOVAL_CONFIRMATION)))
                .isSameAs(job);

        verify(service, times(2)).moduleAuthorization();
        verify(manager).checkForRelease(authorization);
        verify(manager).installOrUpdate(authorization);
        verify(manager).remove();
    }

    @Test
    void moduleRemovalRequiresTheExactServerValidatedConfirmation() {
        ProEntitlementService service = mock(ProEntitlementService.class);
        ProModuleManager manager = mock(ProModuleManager.class);
        ProEntitlementController controller = new ProEntitlementController(
                service, manager);

        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                controller.removeModule(
                        new ProEntitlementController.ModuleRemovalRequest(
                                "remove")))
                .isInstanceOf(ProEntitlementApiException.class)
                .satisfies(exception -> {
                    ProEntitlementApiException api =
                            (ProEntitlementApiException) exception;
                    assertThat(api.code()).isEqualTo(
                            "module_removal_confirmation_required");
                    assertThat(api.status()).isEqualTo(HttpStatus.BAD_REQUEST);
                });
    }

    private static AutarkOsJob job() {
        Instant now = Instant.parse("2026-07-19T12:00:00Z");
        return new AutarkOsJob(
                "job_" + "a".repeat(32),
                "pro_module_change",
                "autark-pro-agent",
                "queued",
                "check_release",
                List.of(AutarkOsJobStep.pending(
                        "check_release",
                        "Check release")),
                now,
                now,
                null);
    }
}

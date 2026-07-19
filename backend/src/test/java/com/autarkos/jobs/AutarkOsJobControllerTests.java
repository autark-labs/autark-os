package com.autarkos.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.marketplace.api.MarketplaceExceptionHandler;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;

class AutarkOsJobControllerTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void exposesListReadAndCancelOperations() {
        AutarkOsJobService service = service();
        AutarkOsJob job = service.start("backup", "vaultwarden", List.of(AutarkOsJobStep.pending("backup", "Creating restore point")), () -> AutarkOsJobOutcome.succeeded("Backup complete."));
        AutarkOsJobController controller = new AutarkOsJobController(service);

        assertThat(controller.jobs()).extracting(AutarkOsJob::jobId).containsExactly(job.jobId());
        assertThat(controller.job(job.jobId()).getBody()).isEqualTo(job);
        assertThat(controller.cancel(job.jobId()).getBody().status()).isEqualTo("cancelled");
        assertThat(controller.job("missing").getStatusCode().value()).isEqualTo(404);
        assertThat(controller.cancel("missing").getStatusCode().value()).isEqualTo(404);
    }

    @Test
    void rejectsRunningJobCancellationAsAnActionableConflict() throws Exception {
        AutarkOsJobService service = service();
        AutarkOsJob job = service.start("backup", "vaultwarden", List.of(AutarkOsJobStep.pending("backup", "Creating restore point")), () -> AutarkOsJobOutcome.succeeded("Backup complete."));
        service.recordProgress(job.jobId(), List.of(AutarkOsJobStep.running("backup", "Creating restore point", "Writing backup archive.")));
        AutarkOsJobController controller = new AutarkOsJobController(service);
        ActivityLogService activityLogService = mock(ActivityLogService.class);
        MarketplaceExceptionHandler handler = new MarketplaceExceptionHandler(activityLogService);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(handler)
                .build();

        mvc.perform(post("/api/jobs/{jobId}/cancel", job.jobId()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("job_cancellation_not_available"))
                .andExpect(jsonPath("$.message").value("This job has already started and cannot be cancelled safely. Wait for it to finish."))
                .andExpect(jsonPath("$.details[0]").value("Current status: running."))
                .andExpect(jsonPath("$.details[1]").value("Wait for the current job to finish before starting another action."));
        verify(activityLogService).warning(
                "system",
                "job_cancellation_rejected",
                "Job cancellation was rejected",
                "This job has already started and cannot be cancelled safely. Wait for it to finish.",
                null);
    }

    private AutarkOsJobService service() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        AutarkOsJobRepository repository = JpaTestRepositories.jobRepository(new RuntimeLayout(properties));
        return new AutarkOsJobService(repository, Runnable::run, false);
    }
}

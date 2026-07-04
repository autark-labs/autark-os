package com.autarkos.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

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
    }

    private AutarkOsJobService service() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        AutarkOsJobRepository repository = JpaTestRepositories.jobRepository(new RuntimeLayout(properties));
        return new AutarkOsJobService(repository, Runnable::run, false);
    }
}

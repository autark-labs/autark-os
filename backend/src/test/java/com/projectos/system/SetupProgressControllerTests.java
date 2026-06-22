package com.projectos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

class SetupProgressControllerTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void returnsAndUpdatesSetupProgress() {
        SetupProgressService service = service();
        SetupProgressController controller = new SetupProgressController(service, new SetupStatusService(service, java.util.List::of));

        SetupProgress completed = controller.complete(new SetupProgressUpdateRequest("welcome"));
        SetupProgress skipped = controller.skip(new SetupProgressUpdateRequest("tailscale_connect"));

        assertThat(controller.progress().completedSteps()).containsExactly("welcome");
        assertThat(completed.lastRecommendedStep()).isEqualTo("host_check");
        assertThat(skipped.skippedSteps()).containsExactly("tailscale_connect");
    }

    private SetupProgressService service() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new SetupProgressService(
                new ProjectSettingsRepository(new RuntimeLayout(properties)),
                () -> Instant.parse("2026-06-20T12:00:00Z"));
    }
}

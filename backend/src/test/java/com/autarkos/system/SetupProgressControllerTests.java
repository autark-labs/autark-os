package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;

class SetupProgressControllerTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void returnsAndUpdatesSetupProgress() {
        SetupProgressService service = service();
        SetupProgressController controller = new SetupProgressController(service, new SetupStatusService(service, java.util.List::of));

        SetupProgressModels.SetupProgress completed = controller.complete(new SetupProgressModels.SetupProgressUpdateRequest("welcome"));
        SetupProgressModels.SetupProgress skipped = controller.skip(new SetupProgressModels.SetupProgressUpdateRequest("tailscale_connect"));

        assertThat(controller.progress().completedSteps()).containsExactly("welcome");
        assertThat(completed.lastRecommendedStep()).isEqualTo("host_check");
        assertThat(skipped.skippedSteps()).containsExactly("tailscale_connect");
    }

    private SetupProgressService service() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new SetupProgressService(
                JpaTestRepositories.projectSettingsRepository(new RuntimeLayout(properties)),
                () -> Instant.parse("2026-06-20T12:00:00Z"));
    }
}

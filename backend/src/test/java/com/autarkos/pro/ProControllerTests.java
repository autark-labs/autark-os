package com.autarkos.pro;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;

class ProControllerTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void returnsLocalProStatus() {
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(runtimeLayout());
        ProController controller = new ProController(new ProService(repository, () -> Instant.parse("2026-07-04T10:00:00Z"), false));

        assertThat(controller.status().mode()).isEqualTo("free");
        assertThat(controller.status().registered()).isFalse();
        assertThat(controller.status().remoteApiConfigured()).isFalse();
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}

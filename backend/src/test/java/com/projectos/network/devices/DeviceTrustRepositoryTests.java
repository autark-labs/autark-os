package com.projectos.network.devices;

import com.projectos.network.api.DeviceTrustUpdateRequest;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;

class DeviceTrustRepositoryTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void upsertsAndReadsDeviceTrustMetadata() {
        DeviceTrustRepository repository = new DeviceTrustRepository(runtimeLayout());

        repository.upsert("device-1", new DeviceTrustUpdateRequest("Jack's phone", "Personal", true, "Daily driver"));
        DeviceTrustMetadata updated = repository.upsert("device-1", new DeviceTrustUpdateRequest("Jack's phone", "Personal", false, "Temporarily blocked"));

        assertThat(updated.trusted()).isFalse();
        assertThat(repository.findAll())
                .containsOnlyKeys("device-1")
                .extractingByKey("device-1")
                .satisfies(metadata -> {
                    assertThat(metadata.nickname()).isEqualTo("Jack's phone");
                    assertThat(metadata.trustGroup()).isEqualTo("Personal");
                    assertThat(metadata.trusted()).isFalse();
                    assertThat(metadata.notes()).isEqualTo("Temporarily blocked");
                    assertThat(metadata.updatedAt()).isNotNull();
                });
    }

    private RuntimeLayout runtimeLayout() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}

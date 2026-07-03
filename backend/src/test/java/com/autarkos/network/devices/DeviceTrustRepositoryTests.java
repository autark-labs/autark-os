package com.autarkos.network.devices;

import com.autarkos.network.api.DeviceTrustUpdateRequest;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;

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
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}

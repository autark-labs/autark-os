package com.autarkos.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;

class MonitoringMetricsRepositoryTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void recordsQueriesAndDeletesHostAndAppSamples() {
        MonitoringMetricsRepository repository = new MonitoringMetricsRepository(runtimeLayout());
        Instant old = Instant.parse("2026-06-19T00:00:00Z");
        Instant current = Instant.parse("2026-06-19T01:00:00Z");

        repository.recordHost(new HostMetricSample(1.0, 2.0, 3.0, 4.0, 1000, 700, 500, 300, old));
        repository.recordHost(new HostMetricSample(5.0, 6.0, 7.0, 8.0, 1000, 600, 500, 200, current));
        repository.recordApp(new AppMetricSample("vaultwarden", 1.5, 2.5, "64MiB", old));
        repository.recordApp(new AppMetricSample("vaultwarden", 3.5, 4.5, "128MiB", current));
        repository.deleteBefore(current);

        assertThat(repository.hostSamplesSince(old))
                .singleElement()
                .satisfies(sample -> {
                    assertThat(sample.systemCpuPercent()).isEqualTo(5.0);
                    assertThat(sample.runtimeUsableBytes()).isEqualTo(200);
                });
        assertThat(repository.appSamplesSince(old))
                .singleElement()
                .satisfies(sample -> {
                    assertThat(sample.appId()).isEqualTo("vaultwarden");
                    assertThat(sample.cpuPercent()).isEqualTo(3.5);
                    assertThat(sample.memoryUsage()).isEqualTo("128MiB");
                });
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }
}

package com.autarkos.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(properties = {
        "autark-os.guardian.enabled=false",
        "autark-os.backups.scheduler.enabled=false"
})
class MetricSampleRepositoryTests {

    @TempDir
    static Path runtimeRoot;

    @Autowired
    HostMetricSampleRepository hostSamples;

    @Autowired
    AppMetricSampleRepository appSamples;

    @DynamicPropertySource
    static void runtimeProperties(DynamicPropertyRegistry registry) {
        registry.add("autark-os.runtime-root", () -> runtimeRoot.toString());
    }

    @Test
    void recordsQueriesAndDeletesHostAndAppSamples() {
        Instant old = Instant.parse("2026-06-19T00:00:00Z");
        Instant current = Instant.parse("2026-06-19T01:00:00Z");

        hostSamples.save(new HostMetricSampleEntity(new HostMetricSample(1.0, 2.0, 3.0, 4.0, 1000, 700, 500, 300, old)));
        hostSamples.save(new HostMetricSampleEntity(new HostMetricSample(5.0, 6.0, 7.0, 8.0, 1000, 600, 500, 200, current)));
        appSamples.save(new AppMetricSampleEntity(new AppMetricSample("vaultwarden", 1.5, 2.5, "64MiB", old)));
        appSamples.save(new AppMetricSampleEntity(new AppMetricSample("vaultwarden", 3.5, 4.5, "128MiB", current)));
        hostSamples.deleteBefore(current.toString());
        appSamples.deleteBefore(current.toString());

        assertThat(hostSamples.since(old.toString()).stream().map(HostMetricSampleEntity::toSample))
                .singleElement()
                .satisfies(sample -> {
                    assertThat(sample.systemCpuPercent()).isEqualTo(5.0);
                    assertThat(sample.runtimeUsableBytes()).isEqualTo(200);
                });
        assertThat(appSamples.since(old.toString()).stream().map(AppMetricSampleEntity::toSample))
                .singleElement()
                .satisfies(sample -> {
                    assertThat(sample.appId()).isEqualTo("vaultwarden");
                    assertThat(sample.cpuPercent()).isEqualTo(3.5);
                    assertThat(sample.memoryUsage()).isEqualTo("128MiB");
                });
    }
}

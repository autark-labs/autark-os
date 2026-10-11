package com.autarkos.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

class MonitoringMetricsServiceTests {
    @Test
    void exportSanitizesNestedTextAndRetainsMeasurementsWithoutChangingLocalHistory() {
        var hosts = mock(HostMetricSampleRepository.class);
        var apps = mock(AppMetricSampleRepository.class);
        var sampledAt = Instant.now();
        String detail = "12 MiB / 1 GiB token=synthetic-token http://192.168.1.5:8090";
        when(hosts.since(anyString())).thenReturn(List.of());
        when(apps.since(anyString())).thenReturn(List.of(new AppMetricSampleEntity(
                new AppMetricSample("vaultwarden", 12.5, 1.2, detail, sampledAt))));
        var service = new MonitoringMetricsService(hosts, apps);

        assertThat(service.history(60).appSamples().getFirst().memoryUsage()).isEqualTo(detail);
        var exported = service.diagnostics(60);
        assertThat(exported.appSampleCount()).isEqualTo(1);
        assertThat(exported.history().appSamples()).singleElement().satisfies(sample -> {
            assertThat(sample.appId()).isEqualTo("vaultwarden");
            assertThat(sample.cpuPercent()).isEqualTo(12.5);
            assertThat(sample.sampledAt()).isEqualTo(sampledAt);
            assertThat(sample.memoryUsage()).contains("12 MiB / 1 GiB")
                    .doesNotContain("synthetic-token", "192.168.1.5");
        });
    }
}

package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SystemMetricsServiceTests {

    @TempDir
    Path tempDir;

    @Test
    void linuxMemoryMetricsUsesMemAvailableForUserFacingUsage() throws Exception {
        Path meminfo = tempDir.resolve("meminfo");
        Files.writeString(meminfo, """
                MemTotal:       131072000 kB
                MemFree:          4096000 kB
                MemAvailable:    98304000 kB
                Buffers:          1024000 kB
                Cached:          51200000 kB
                """);

        SystemMetricsService.MemoryMetrics metrics = new SystemMetricsService(null).linuxMemoryMetrics(meminfo);

        assertThat(metrics.totalBytes()).isEqualTo(131072000L * 1024L);
        assertThat(metrics.availableBytes()).isEqualTo(98304000L * 1024L);
        assertThat(metrics.usedBytes()).isEqualTo((131072000L - 98304000L) * 1024L);
    }
}

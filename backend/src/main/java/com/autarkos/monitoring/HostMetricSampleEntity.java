package com.autarkos.monitoring;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "host_metric_samples")
public class HostMetricSampleEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "system_cpu_percent", nullable = false)
    private double systemCpuPercent;

    @Column(name = "process_cpu_percent", nullable = false)
    private double processCpuPercent;

    @Column(name = "used_memory_percent", nullable = false)
    private double usedMemoryPercent;

    @Column(name = "runtime_used_percent", nullable = false)
    private double runtimeUsedPercent;

    @Column(name = "total_memory_bytes", nullable = false)
    private long totalMemoryBytes;

    @Column(name = "free_memory_bytes", nullable = false)
    private long freeMemoryBytes;

    @Column(name = "runtime_total_bytes", nullable = false)
    private long runtimeTotalBytes;

    @Column(name = "runtime_usable_bytes", nullable = false)
    private long runtimeUsableBytes;

    @Column(name = "sampled_at", nullable = false)
    private String sampledAt;

    protected HostMetricSampleEntity() {
    }

    public HostMetricSampleEntity(HostMetricSample sample) {
        this.systemCpuPercent = sample.systemCpuPercent();
        this.processCpuPercent = sample.processCpuPercent();
        this.usedMemoryPercent = sample.usedMemoryPercent();
        this.runtimeUsedPercent = sample.runtimeUsedPercent();
        this.totalMemoryBytes = sample.totalMemoryBytes();
        this.freeMemoryBytes = sample.freeMemoryBytes();
        this.runtimeTotalBytes = sample.runtimeTotalBytes();
        this.runtimeUsableBytes = sample.runtimeUsableBytes();
        this.sampledAt = sample.sampledAt().toString();
    }

    public HostMetricSample toSample() {
        return new HostMetricSample(
                systemCpuPercent,
                processCpuPercent,
                usedMemoryPercent,
                runtimeUsedPercent,
                totalMemoryBytes,
                freeMemoryBytes,
                runtimeTotalBytes,
                runtimeUsableBytes,
                java.time.Instant.parse(sampledAt));
    }
}

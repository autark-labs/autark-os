package com.autarkos.monitoring;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "app_metric_samples")
public class AppMetricSampleEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "app_id", nullable = false)
    private String appId;

    @Column(name = "cpu_percent", nullable = false)
    private double cpuPercent;

    @Column(name = "memory_percent", nullable = false)
    private double memoryPercent;

    @Column(name = "memory_usage")
    private String memoryUsage;

    @Column(name = "sampled_at", nullable = false)
    private String sampledAt;

    protected AppMetricSampleEntity() {
    }

    public AppMetricSampleEntity(AppMetricSample sample) {
        this.appId = sample.appId();
        this.cpuPercent = sample.cpuPercent();
        this.memoryPercent = sample.memoryPercent();
        this.memoryUsage = sample.memoryUsage();
        this.sampledAt = sample.sampledAt().toString();
    }

    public AppMetricSample toSample() {
        return new AppMetricSample(
                appId,
                cpuPercent,
                memoryPercent,
                memoryUsage,
                java.time.Instant.parse(sampledAt));
    }
}

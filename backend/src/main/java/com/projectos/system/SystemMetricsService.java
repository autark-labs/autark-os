package com.projectos.system;

import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.projectos.marketplace.runtime.RuntimeLayout;

@Service
public class SystemMetricsService {

    private final RuntimeLayout runtimeLayout;

    public SystemMetricsService(RuntimeLayout runtimeLayout) {
        this.runtimeLayout = runtimeLayout;
    }

    public SystemMetrics metrics() {
        com.sun.management.OperatingSystemMXBean operatingSystem = operatingSystem();
        Path runtimeRoot = runtimeLayout.runtimeRoot();
        DiskMetrics disk = diskMetrics(runtimeRoot);
        MemoryMetrics memory = memoryMetrics(operatingSystem);

        return new SystemMetrics(
                deviceName(),
                System.getProperty("user.name", "unknown"),
                System.getProperty("os.name", "unknown"),
                System.getProperty("os.version", "unknown"),
                System.getProperty("os.arch", "unknown"),
                System.getProperty("java.version", "unknown"),
                operatingSystem.getAvailableProcessors(),
                percent(operatingSystem.getCpuLoad()),
                percent(operatingSystem.getProcessCpuLoad()),
                operatingSystem.getSystemLoadAverage(),
                memory.totalBytes(),
                memory.availableBytes(),
                ratioPercent(memory.usedBytes(), memory.totalBytes()),
                runtimeRoot.toAbsolutePath().normalize().toString(),
                disk.totalBytes(),
                disk.usableBytes(),
                ratioPercent(Math.max(0, disk.totalBytes() - disk.usableBytes()), disk.totalBytes()),
                Instant.now());
    }

    private com.sun.management.OperatingSystemMXBean operatingSystem() {
        return (com.sun.management.OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
    }

    private DiskMetrics diskMetrics(Path runtimeRoot) {
        try {
            Files.createDirectories(runtimeRoot);
            FileStore store = Files.getFileStore(runtimeRoot);
            return new DiskMetrics(store.getTotalSpace(), store.getUsableSpace());
        } catch (IOException exception) {
            return new DiskMetrics(0, 0);
        }
    }

    private MemoryMetrics memoryMetrics(com.sun.management.OperatingSystemMXBean operatingSystem) {
        MemoryMetrics linuxMemory = linuxMemoryMetrics(Path.of("/proc/meminfo"));
        if (linuxMemory.valid()) {
            return linuxMemory;
        }
        long totalMemory = operatingSystem.getTotalMemorySize();
        long availableMemory = operatingSystem.getFreeMemorySize();
        return MemoryMetrics.of(totalMemory, availableMemory);
    }

    MemoryMetrics linuxMemoryMetrics(Path meminfoPath) {
        if (!Files.isRegularFile(meminfoPath)) {
            return MemoryMetrics.unavailable();
        }
        try {
            Map<String, Long> values = new HashMap<>();
            for (String line : Files.readAllLines(meminfoPath)) {
                int separator = line.indexOf(':');
                if (separator <= 0) {
                    continue;
                }
                String key = line.substring(0, separator).trim();
                String[] parts = line.substring(separator + 1).trim().split("\\s+");
                if (parts.length == 0) {
                    continue;
                }
                values.put(key, Long.parseLong(parts[0]) * 1024L);
            }
            long total = values.getOrDefault("MemTotal", 0L);
            long available = values.getOrDefault("MemAvailable", values.getOrDefault("MemFree", 0L));
            return MemoryMetrics.of(total, available);
        } catch (IOException | NumberFormatException exception) {
            return MemoryMetrics.unavailable();
        }
    }

    private String deviceName() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (UnknownHostException exception) {
            return "Project OS device";
        }
    }

    private double percent(double value) {
        if (Double.isNaN(value) || value < 0) {
            return -1;
        }
        return Math.round(value * 10_000.0) / 100.0;
    }

    private double ratioPercent(long used, long total) {
        if (total <= 0) {
            return -1;
        }
        return Math.round(((double) used / (double) total) * 10_000.0) / 100.0;
    }

    private record DiskMetrics(long totalBytes, long usableBytes) {
    }

    record MemoryMetrics(long totalBytes, long availableBytes) {
        static MemoryMetrics of(long totalBytes, long availableBytes) {
            return new MemoryMetrics(Math.max(0, totalBytes), Math.max(0, Math.min(availableBytes, totalBytes)));
        }

        static MemoryMetrics unavailable() {
            return new MemoryMetrics(0, 0);
        }

        long usedBytes() {
            return Math.max(0, totalBytes - availableBytes);
        }

        boolean valid() {
            return totalBytes > 0;
        }
    }
}

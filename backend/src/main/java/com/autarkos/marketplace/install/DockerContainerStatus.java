package com.autarkos.marketplace.install;

public record DockerContainerStatus(
        String name,
        String service,
        String state,
        String health,
        String status,
        String ports) {
}

package com.autarkos.host;

import java.util.Map;

public record HostDockerContainer(
        String name,
        String image,
        String status,
        Map<String, String> labels,
        String ports) {
}

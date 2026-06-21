package com.projectos.host;

import java.util.Map;

public record HostDockerContainer(
        String name,
        String image,
        String status,
        Map<String, String> labels,
        String ports) {
}

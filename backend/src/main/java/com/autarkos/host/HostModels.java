package com.autarkos.host;

import java.util.Map;
import java.util.List;

public final class HostModels {

    private HostModels() {
    }

    public record HostDockerContainer(
            String name,
            String image,
            String status,
            Map<String, String> labels,
            String ports,
            List<HostDockerMount> mounts) {

        public HostDockerContainer(String name, String image, String status, Map<String, String> labels, String ports) {
            this(name, image, status, labels, ports, List.of());
        }

        public HostDockerContainer {
            labels = Map.copyOf(labels == null ? Map.of() : labels);
            mounts = List.copyOf(mounts == null ? List.of() : mounts);
        }
    }

    public record HostDockerMount(
            String type,
            String source,
            String destination,
            boolean readOnly) {
    }

    public static final class ObservedServiceSource {
        public static final String DOCKER = "docker";
        public static final String AUTARK_OS_INSTALL = "autark_os_install";

        private ObservedServiceSource() {
        }
    }

}

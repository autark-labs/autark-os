package com.autarkos.host;

import java.util.Map;

public final class HostModels {

    private HostModels() {
    }

    public record HostDockerContainer(
            String name,
            String image,
            String status,
            Map<String, String> labels,
            String ports) {
    }

    public static final class ObservedServiceSource {
        public static final String DOCKER = "docker";
        public static final String AUTARK_OS_INSTALL = "autark_os_install";

        private ObservedServiceSource() {
        }
    }

}

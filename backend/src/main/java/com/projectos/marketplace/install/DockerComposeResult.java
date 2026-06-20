package com.projectos.marketplace.install;

import java.util.List;

public record DockerComposeResult(int exitCode, List<String> output) {
    public boolean successful() {
        return exitCode == 0;
    }
}

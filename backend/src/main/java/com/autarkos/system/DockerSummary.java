package com.autarkos.system;

public record DockerSummary(
        boolean ready,
        String summary) {
}

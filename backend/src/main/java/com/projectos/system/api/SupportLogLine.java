package com.projectos.system.api;

public record SupportLogLine(
        String line,
        String level,
        boolean redacted) {
}

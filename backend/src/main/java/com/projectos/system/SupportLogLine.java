package com.projectos.system;

public record SupportLogLine(
        String line,
        String level,
        boolean redacted) {
}

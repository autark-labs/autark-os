package com.autarkos.system.api;

public record SupportLogLine(
        String line,
        String level,
        boolean redacted) {
}

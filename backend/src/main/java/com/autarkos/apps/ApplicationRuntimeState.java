package com.autarkos.apps;

import com.fasterxml.jackson.annotation.JsonValue;

public enum ApplicationRuntimeState {
    READY("ready"),
    STARTING("starting"),
    STOPPED("stopped"),
    DEGRADED("degraded"),
    MISSING("missing"),
    UNKNOWN("unknown");

    private final String value;

    ApplicationRuntimeState(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }

    public static ApplicationRuntimeState fromStatus(String status) {
        if (status == null) {
            return UNKNOWN;
        }
        return switch (status.trim().toLowerCase(java.util.Locale.ROOT)) {
            case "ready" -> READY;
            case "starting" -> STARTING;
            case "paused", "stopped" -> STOPPED;
            case "missing" -> MISSING;
            case "needs attention", "unavailable", "degraded" -> DEGRADED;
            default -> UNKNOWN;
        };
    }
}

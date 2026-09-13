package com.autarkos.apps;

import com.fasterxml.jackson.annotation.JsonValue;

public enum ApplicationRelationship {
    AVAILABLE("available"),
    MANAGED("managed"),
    RECOVERY_REQUIRED("recovery_required"),
    BLOCKED("blocked");

    private final String value;

    ApplicationRelationship(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }
}

package com.projectos.apps;

import com.fasterxml.jackson.annotation.JsonValue;

public enum AppOwnershipState {
    AVAILABLE("available"),
    INSTALLED_MANAGED("installed_managed"),
    PINNED_EXTERNAL("pinned_external"),
    FOUND_ON_SERVER("found_on_server"),
    RECOVERABLE("recoverable"),
    MANAGED_ELSEWHERE("managed_elsewhere"),
    BLOCKED("blocked"),
    FAILED_INSTALL("failed_install"),
    COMING_SOON("coming_soon");

    private final String value;

    AppOwnershipState(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }
}

package com.autarkos.apps;

public record AppOwnershipAction(
        String id,
        String label,
        String kind,
        String href,
        String method,
        boolean disabled,
        String reason) {
}

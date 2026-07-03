package com.autarkos.system.api;

public record SystemSetupAction(
        String id,
        String label,
        String route,
        String style) {
}

package com.autarkos.system.api;

public record SupportCommand(
        String id,
        String label,
        String description,
        String command,
        String destination) {
}

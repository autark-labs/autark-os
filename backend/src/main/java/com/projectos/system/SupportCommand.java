package com.projectos.system;

public record SupportCommand(
        String id,
        String label,
        String description,
        String command,
        String destination) {
}

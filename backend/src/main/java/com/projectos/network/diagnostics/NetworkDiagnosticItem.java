package com.projectos.network.diagnostics;

public record NetworkDiagnosticItem(
        String id,
        String label,
        String status,
        String message,
        String detail,
        String actionLabel) {
}

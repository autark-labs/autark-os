package com.autarkos.network.diagnostics;

import java.time.Instant;
import java.util.List;

public record NetworkDiagnosticsReport(
        String status,
        String headline,
        String summary,
        List<NetworkDiagnosticItem> checks,
        List<NetworkDiagnosticItem> appChecks,
        Instant checkedAt) {
}

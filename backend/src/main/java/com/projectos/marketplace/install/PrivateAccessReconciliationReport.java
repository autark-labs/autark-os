package com.projectos.marketplace.install;

import java.time.Instant;
import java.util.List;

public record PrivateAccessReconciliationReport(
        String status,
        String headline,
        String summary,
        List<PrivateAccessReconciliationItem> apps,
        List<PrivateAccessStaleMapping> staleMappings,
        Instant checkedAt) {
}

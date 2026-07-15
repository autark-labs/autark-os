package com.autarkos.marketplace.install;

import java.time.Instant;
import java.util.List;

import com.autarkos.network.tailscale.TailscaleServeMapping;

record PrivateAccessState(
        boolean requested,
        String status,
        String message,
        String detail,
        String actionLabel,
        String expectedPrivateUrl,
        String verifiedPrivateUrl,
        Integer expectedLocalPort,
        Integer expectedHttpsPort,
        TailscaleServeMapping mapping,
        List<String> liveMappings,
        String matchReason,
        Instant verifiedAt) {

    boolean verified() {
        return "verified".equals(status);
    }

    boolean needsAttention() {
        return requested && !List.of("verified", "waiting", "not_enabled").contains(status);
    }
}

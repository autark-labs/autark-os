package com.autarkos.access;

import java.time.Instant;
import java.util.List;

import com.autarkos.api.AutarkOsAction;
import com.autarkos.api.AutarkOsIssue;

public record AccessStatus(
        String mode,
        String serverLanUrl,
        AccessTailscaleStatus tailscale,
        List<AccessAppStatus> apps,
        List<AutarkOsIssue> issues,
        List<AutarkOsAction> actions,
        Instant updatedAt) {
}

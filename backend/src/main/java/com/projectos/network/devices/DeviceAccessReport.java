package com.projectos.network.devices;

import java.time.Instant;
import java.util.List;

import com.projectos.marketplace.install.PrivateAccessReconciliationReport;
import com.projectos.network.tailscale.TailscaleStatus;

public record DeviceAccessReport(
        String status,
        String headline,
        String summary,
        TailscaleStatus tailscale,
        PrivateAccessReconciliationReport privateAccess,
        List<TrustedDeviceView> devices,
        List<String> onboardingSteps,
        Instant checkedAt) {
}

package com.autarkos.network.devices;

import java.time.Instant;
import java.util.List;

import com.autarkos.marketplace.install.PrivateAccessReconciliationReport;
import com.autarkos.network.tailscale.TailscaleStatus;

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

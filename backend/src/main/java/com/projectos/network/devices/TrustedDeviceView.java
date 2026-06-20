package com.projectos.network.devices;

import com.projectos.network.tailscale.TailscaleDevice;

public record TrustedDeviceView(
        TailscaleDevice device,
        DeviceTrustMetadata metadata,
        DeviceReachability reachability) {
}

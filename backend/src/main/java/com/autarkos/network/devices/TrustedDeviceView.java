package com.autarkos.network.devices;

import com.autarkos.network.tailscale.TailscaleDevice;

public record TrustedDeviceView(
        TailscaleDevice device,
        DeviceTrustMetadata metadata,
        DeviceReachability reachability) {
}

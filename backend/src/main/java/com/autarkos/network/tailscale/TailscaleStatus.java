package com.autarkos.network.tailscale;

import java.util.List;

public record TailscaleStatus(
        boolean installed,
        boolean connected,
        String state,
        String message,
        String deviceName,
        String dnsName,
        List<String> tailnetIps,
        String tailnetName,
        String loginName) {

    public static TailscaleStatus notInstalled() {
        return new TailscaleStatus(false, false, "not_installed", "Tailscale is not installed on this device yet.", null, null, List.of(), null, null);
    }

    public static TailscaleStatus notConnected(String message) {
        return new TailscaleStatus(true, false, "not_connected", message, null, null, List.of(), null, null);
    }
}

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
        String loginName,
        Boolean magicDnsReady,
        Boolean httpsReady,
        Boolean serveReady) {

    public TailscaleStatus(boolean installed, boolean connected, String state, String message, String deviceName,
            String dnsName, List<String> tailnetIps, String tailnetName, String loginName) {
        this(installed, connected, state, message, deviceName, dnsName, tailnetIps, tailnetName, loginName, null, null, null);
    }

    public static TailscaleStatus notInstalled() {
        return new TailscaleStatus(false, false, "not_installed", "Tailscale is not installed on this device yet.", null, null, List.of(), null, null, false, false, false);
    }

    public static TailscaleStatus notConnected(String message) {
        return new TailscaleStatus(true, false, "not_connected", message, null, null, List.of(), null, null, false, false, false);
    }
}

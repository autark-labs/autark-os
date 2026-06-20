package com.projectos.network.tailscale;

import java.util.List;

public record TailscaleDevice(
        String id,
        String name,
        String dnsName,
        List<String> tailnetIps,
        String operatingSystem,
        boolean online,
        String lastSeen,
        String connectionType,
        String relay,
        String currentAddress,
        boolean exitNode,
        boolean self,
        String user) {
}

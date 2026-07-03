package com.autarkos.network.tailscale;

public record TailscaleServeMapping(
        String serviceName,
        String endpoint,
        Integer servePort,
        String target,
        Integer targetPort) {
}

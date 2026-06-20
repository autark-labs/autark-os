package com.projectos.network.tailscale;

public record TailscaleServeMapping(
        String serviceName,
        String endpoint,
        Integer servePort,
        String target,
        Integer targetPort) {
}

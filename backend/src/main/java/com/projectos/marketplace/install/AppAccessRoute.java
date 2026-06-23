package com.projectos.marketplace.install;

public record AppAccessRoute(
        String primaryOpenUrl,
        String localUrl,
        String privateUrl,
        String backendTargetUrl,
        String backendProtocol,
        Integer localPort,
        Integer privatePort,
        String privateLinkStatus) {
}

package com.projectos.marketplace.install;

public record PrivateAccessStaleMapping(
        String id,
        String serviceName,
        String endpoint,
        Integer servePort,
        String target,
        Integer targetPort,
        String message,
        String detail,
        String actionLabel) {
}

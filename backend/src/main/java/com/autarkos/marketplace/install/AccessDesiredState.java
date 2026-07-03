package com.autarkos.marketplace.install;

public record AccessDesiredState(
        String mode,
        String label,
        String localUrl,
        String privateUrl,
        Integer expectedLocalPort,
        String expectedProtocol,
        String privateAccessRequirement,
        boolean privateAccessRequired,
        boolean privateAccessRecommended) {
}

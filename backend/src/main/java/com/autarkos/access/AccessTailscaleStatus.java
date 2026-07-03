package com.autarkos.access;

public record AccessTailscaleStatus(
        boolean installed,
        boolean signedIn,
        String hostname,
        boolean magicDnsReady,
        boolean httpsReady,
        boolean serveReady,
        String mode) {
}

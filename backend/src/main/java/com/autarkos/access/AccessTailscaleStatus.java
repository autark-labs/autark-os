package com.autarkos.access;

public record AccessTailscaleStatus(
        boolean installed,
        boolean signedIn,
        String hostname,
        Boolean magicDnsReady,
        Boolean httpsReady,
        Boolean serveReady,
        String mode) {
}

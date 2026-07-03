package com.autarkos.marketplace.install;

public record PostInstallValue(
        String label,
        String value,
        boolean sensitive,
        boolean qr) {
}

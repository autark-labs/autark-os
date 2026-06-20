package com.projectos.marketplace.install;

public record AppSetupField(
        String label,
        String value,
        boolean sensitive,
        boolean qr,
        boolean recoverable) {
}

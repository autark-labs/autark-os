package com.autarkos.marketplace.model;

public record UsageField(
        String label,
        String value,
        boolean sensitive,
        boolean qr) {
}

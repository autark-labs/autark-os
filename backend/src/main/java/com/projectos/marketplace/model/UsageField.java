package com.projectos.marketplace.model;

public record UsageField(
        String label,
        String value,
        boolean sensitive,
        boolean qr) {
}

package com.autarkos.marketplace.model;

public record SetupField(
        String label,
        String value,
        boolean sensitive) {
}

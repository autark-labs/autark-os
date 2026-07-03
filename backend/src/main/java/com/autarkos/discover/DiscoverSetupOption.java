package com.autarkos.discover;

public record DiscoverSetupOption(
        String value,
        String label,
        String description,
        boolean recommended,
        boolean advanced) {
}

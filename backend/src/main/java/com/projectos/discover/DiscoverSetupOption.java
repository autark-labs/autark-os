package com.projectos.discover;

public record DiscoverSetupOption(
        String value,
        String label,
        String description,
        boolean recommended,
        boolean advanced) {
}

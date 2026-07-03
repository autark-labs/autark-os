package com.autarkos.discover;

public record DiscoverInstallIssue(
        String fieldId,
        String severity,
        String message) {
}

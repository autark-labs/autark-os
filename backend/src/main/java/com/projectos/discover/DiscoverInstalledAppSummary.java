package com.projectos.discover;

public record DiscoverInstalledAppSummary(
        String appId,
        String appName,
        String status,
        String accessUrl) {
}

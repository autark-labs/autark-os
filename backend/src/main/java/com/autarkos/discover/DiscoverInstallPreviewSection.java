package com.autarkos.discover;

import java.util.List;

public record DiscoverInstallPreviewSection(
        String id,
        String title,
        List<DiscoverInstallPreviewItem> items) {
}

package com.autarkos.discover;

import java.util.List;

import com.autarkos.marketplace.api.InstallOptionsRequest;
import com.autarkos.marketplace.plan.InstallPlan;

public record DiscoverInstallPreview(
        boolean valid,
        List<DiscoverInstallIssue> blockingIssues,
        List<DiscoverInstallIssue> warnings,
        List<DiscoverInstallPreviewSection> sections,
        InstallPlan technicalDetails,
        InstallOptionsRequest installOptions) {
}

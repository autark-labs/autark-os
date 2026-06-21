package com.projectos.discover;

import java.util.List;

import com.projectos.marketplace.api.InstallOptionsRequest;
import com.projectos.marketplace.plan.InstallPlan;

public record DiscoverInstallPreview(
        boolean valid,
        List<DiscoverInstallIssue> blockingIssues,
        List<DiscoverInstallIssue> warnings,
        List<DiscoverInstallPreviewSection> sections,
        InstallPlan technicalDetails,
        InstallOptionsRequest installOptions) {
}

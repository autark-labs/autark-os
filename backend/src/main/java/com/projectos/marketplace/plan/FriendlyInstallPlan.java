package com.projectos.marketplace.plan;

import java.util.List;

public record FriendlyInstallPlan(
        String headline,
        String estimatedTime,
        List<String> recommendedFor,
        List<String> willCreate,
        List<String> willRun,
        List<String> willExpose,
        List<String> willConfigure,
        List<String> willBackUp) {
}

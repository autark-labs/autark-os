package com.autarkos.marketplace.install;

import java.util.List;

public record PostInstallGuide(
        String kind,
        String primaryAction,
        String openUrlLabel,
        String headline,
        String summary,
        List<String> setupSteps,
        List<PostInstallValue> values,
        List<String> notes) {
}

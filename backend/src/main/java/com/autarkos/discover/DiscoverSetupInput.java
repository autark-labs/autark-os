package com.autarkos.discover;

import java.util.List;
import java.util.Map;

public record DiscoverSetupInput(
        String id,
        String label,
        String type,
        String tier,
        boolean required,
        Object defaultValue,
        String help,
        List<DiscoverSetupOption> options,
        Map<String, String> showWhen) {
}

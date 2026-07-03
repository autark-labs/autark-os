package com.autarkos.discover;

import java.util.List;

public record DiscoverSetupSchema(
        String appId,
        int version,
        List<DiscoverSetupInput> inputs) {
}

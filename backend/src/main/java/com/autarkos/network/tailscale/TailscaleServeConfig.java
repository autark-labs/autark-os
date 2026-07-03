package com.autarkos.network.tailscale;

import java.time.Instant;
import java.util.List;

public record TailscaleServeConfig(
        boolean available,
        String status,
        String message,
        List<TailscaleServeMapping> mappings,
        List<String> output,
        Instant checkedAt) {

    public static TailscaleServeConfig unavailable(String status, String message, List<String> output) {
        return new TailscaleServeConfig(false, status, message, List.of(), output, Instant.now());
    }
}
